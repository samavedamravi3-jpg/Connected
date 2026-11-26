import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '@/components/ui';
import { isRemoteId } from '@/lib/backend';
import { allowed } from '@/lib/guard';
import { idBlocks, isIdRequiredError } from '@/lib/idVerification';
import { firstName } from '@/lib/match';
import { RESPONSE_LABEL, canRespond, responseAction, type NearbyPost, type ResponseAction, type ViewerRelation } from '@/lib/posts/model';
import { markResponded } from '@/lib/posts/store';
import { useApp } from '@/state/AppState';
import { C, F, R, S, T } from '@/theme';

const excerpt = (s: string) => (s.length > 60 ? `${s.slice(0, 57).trimEnd()}…` : s);
const opener = (a: ResponseAction, first: string, caption: string) => {
  const q = `“${excerpt(caption)}”`;
  switch (a) {
    case 'interested': return `Hi ${first}! Saw your post ${q} and I’m interested. `;
    case 'help': return `Hi ${first}, saw your post ${q}. I think I can help. `;
    case 'join': return `Hi ${first}, saw your post ${q}. I’d love to join you. `;
    default: return `Hi ${first}, re your post ${q}: `;
  }
};

/**
 * A short, editable message that references the post. It goes through the normal connection rules:
 * an accepted connection continues in chat; anyone else sends a request the author can accept or decline.
 */
export function RespondSheet({ post, rel, onClose }: { post: NearbyPost | null; rel: ViewerRelation; onClose: () => void }) {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const action = responseAction(post?.intent ?? null);
  const first = post ? firstName(post.author.name) : '';
  const [msg, setMsg] = useState(() => (post ? opener(action, first, post.caption) : ''));
  const [busy, setBusy] = useState(false);
  if (!post) return null;
  const check = canRespond(post, rel, app.now);

  const send = async () => {
    if (!check.ok) return;
    const body = msg.trim();
    if (body.length < 10) return Alert.alert('Add a little more', `A sentence helps ${first} know what you have in mind.`);
    if (!(await allowed('Your message', body))) return;
    if (check.via === 'chat') {
      const req = app.requests.find((r) => r.personId === post.author.id && r.status === 'accepted');
      onClose();
      if (req) router.push({ pathname: '/chat/[id]', params: { id: req.id, draft: body } });
      return;
    }
    if (app.backendEnabled && isRemoteId(post.author.id) && idBlocks(app.idStatus, 'send connection requests')) return;
    setBusy(true);
    try {
      await app.sendRequest(post.author.id, body);
      markResponded(post.id, post.author.id);
      onClose();
    } catch (e) {
      if (isIdRequiredError(e)) return void idBlocks('unverified', 'send connection requests');
      Alert.alert('Couldn’t send', e instanceof Error ? e.message : 'Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + S.md }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{RESPONSE_LABEL[action]}</Text>
          <Text style={T.small}>
            {check.ok
              ? check.via === 'chat'
                ? `You’re connected with ${first}, so this opens your chat.`
                : `${first} gets this as a request and can accept or decline.${post.isDemo ? ' Demo: the reply is simulated.' : ''}`
              : check.reason}
          </Text>
          {check.ok ? (
            <>
              <TextInput value={msg} onChangeText={(t) => setMsg(t.slice(0, 500))} multiline autoFocus style={styles.input} accessibilityLabel={`Message to ${first}`} />
              <Button label={check.via === 'chat' ? 'Continue in chat' : 'Send request'} loading={busy} onPress={send} />
            </>
          ) : rel.signedIn ? null : (
            <Button label="Sign in" onPress={() => { onClose(); router.push('/auth'); }} />
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(27,26,33,0.3)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: S.lg, gap: S.md },
  handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: C.line2 },
  title: { fontFamily: F.display, fontSize: 22, color: C.ink },
  input: { minHeight: 110, borderRadius: R.md, backgroundColor: C.bg, padding: S.md, fontSize: 16, lineHeight: 23, color: C.ink, textAlignVertical: 'top' },
});
