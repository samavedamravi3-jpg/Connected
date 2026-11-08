import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, Note, Row, Segmented, Tag } from '@/components/ui';
import { fieldLabel, statusLabel } from '@/data/options';
import { dataSource } from '@/data/source';
import type { RequestStatus } from '@/data/types';
import { firstName } from '@/lib/match';
import { dayLabel, fmtTime } from '@/lib/time';
import { useApp } from '@/state/AppState';
import { C, S, T } from '@/theme';

const STATUS_TAG: Record<RequestStatus, { label: string; tone: 'warn' | 'ok' | 'neutral' }> = {
  requested: { label: 'Requested', tone: 'warn' },
  accepted: { label: 'Accepted', tone: 'ok' },
  declined: { label: 'Declined', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export default function Inbox() {
  const app = useApp();
  const [tab, setTab] = useState<'sent' | 'received'>('sent');
  const sent = [...app.requests].sort((a, b) => b.updatedAt - a.updatedAt);
  const newCount = app.incoming.filter((i) => i.state === 'new').length;

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, gap: S.lg, paddingBottom: S.xxl }}>
      <Segmented
        label="Inbox section"
        options={[{ id: 'sent', label: `Sent${sent.length ? ` (${sent.length})` : ''}` }, { id: 'received', label: `Received${newCount ? ` (${newCount})` : ''}` }]}
        value={tab}
        onChange={setTab}
      />

      {tab === 'sent' ? (
        sent.length ? (
          sent.map((r) => {
            const p = dataSource.getPerson(r.personId);
            if (!p) return null;
            const s = STATUS_TAG[r.status];
            return (
              <Pressable
                key={r.id}
                accessibilityRole="button"
                onPress={() => (r.status === 'accepted' ? router.push({ pathname: '/chat/[id]', params: { id: r.id } }) : router.push({ pathname: '/person/[id]', params: { id: p.id } }))}
                style={({ pressed }) => [styles.item, pressed && { backgroundColor: C.bg2 }]}
              >
                <Avatar name={p.name} uri={p.photo} />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={T.h3} numberOfLines={1}>{p.name}</Text>
                    <Tag label={s.label} tone={s.tone} />
                  </Row>
                  <Text style={T.small} numberOfLines={2}>{lastLine(app.messages[r.id]?.at(-1)?.text ?? r.message)}</Text>
                  <Text style={[T.small, { fontSize: 12 }]}>{dayLabel(r.updatedAt)}, {fmtTime(r.updatedAt)}</Text>
                  {r.status === 'requested' ? (
                    <Row>
                      <Button label="Cancel" variant="secondary" small onPress={() => app.cancelRequest(r.id)} />
                      <Button label="Demo: accept" variant="quiet" small onPress={() => app.simulateReply(r.id, 'accepted')} />
                    </Row>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        ) : (
          <View style={styles.empty}>
            <Ionicons name="paper-plane-outline" size={36} color={C.ink3} />
            <Text style={T.h3}>No requests yet</Text>
            <Text style={[T.muted, { textAlign: 'center' }]}>Open someone on the map and we’ll help you write a first message.</Text>
            <Button label="Go to the map" onPress={() => router.navigate('/')} />
          </View>
        )
      ) : (
        <>
          <Note icon="flask-outline">These are sample requests so you can try the other side. They’re from demo profiles, not real people.</Note>
          {app.incoming.map((i) => (
            <Card key={i.id}>
              <Row style={{ flexWrap: 'nowrap' }}>
                <Avatar name={i.name} />
                <View style={{ flex: 1 }}>
                  <Text style={T.h3}>{i.name}</Text>
                  <Text style={T.small}>{i.role} · {statusLabel(i.status)} · {fieldLabel(i.field)}</Text>
                </View>
                {i.state === 'new' ? <Tag label="New" tone="warn" /> : <Tag label={i.state === 'accepted' ? 'Accepted' : 'Declined'} tone={i.state === 'accepted' ? 'ok' : 'neutral'} />}
              </Row>
              <Text style={[T.body, { fontSize: 15 }]}>{i.message}</Text>
              {i.state === 'new' ? (
                <Row>
                  <Button label="Accept" small onPress={() => app.respondIncoming(i.id, 'accepted')} />
                  <Button label="Decline" small variant="secondary" onPress={() => app.respondIncoming(i.id, 'declined')} />
                </Row>
              ) : (
                <Row>
                  <Text style={[T.small, { flex: 1 }]}>
                    {i.state === 'accepted' ? `${firstName(i.name)} can now message you. Suggest a public place to meet.` : `${firstName(i.name)} gets a short, polite note with no reason given.`}
                  </Text>
                  <Button label="Undo" variant="quiet" small onPress={() => app.respondIncoming(i.id, 'new')} />
                </Row>
              )}
            </Card>
          ))}
        </>
      )}
    </ScrollView>
  );
}

const lastLine = (s: string) => s.replace(/\s+/g, ' ');

const styles = StyleSheet.create({
  item: { flexDirection: 'row', gap: S.md, padding: S.md, borderWidth: 1, borderColor: C.line, borderRadius: 12, alignItems: 'flex-start' },
  empty: { alignItems: 'center', gap: S.md, paddingVertical: S.xxl, paddingHorizontal: S.lg },
});
