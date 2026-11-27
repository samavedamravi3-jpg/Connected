import { router, Stack } from 'expo-router';
import { Alert, Linking, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LegalLinks } from '@/components/Legal';
import { Button, Card, Note, Section } from '@/components/ui';
import { CONTACT_LINE } from '@/legal/config';
import { useApp } from '@/state/AppState';
import { C, S, T } from '@/theme';

/** One place for every data control. Only controls that really exist are shown. */
export default function PrivacyData() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  return (
    <>
      <Stack.Screen options={{ title: 'Privacy & data' }} />
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: S.lg, paddingBottom: insets.bottom + S.xxl, gap: S.xl }}>
        <Note icon="shield-checkmark-outline" tone="accent">We have no analytics, ads or marketing messages, so there is nothing to opt out of there. Below are the choices that do exist.</Note>

        <Section title="Choices">
          <Card style={{ gap: S.lg }}>
            <Row2 title="Show me in nearby discovery" body="Lets other members find you on the map." value={app.prefs.discoverable} onChange={(v) => app.setPrefs({ discoverable: v })} />
            <Row2 title="Share my rough area" body="Saves your position rounded to about 1 km. Off shows only the area you pick." value={app.prefs.shareMode === 'area'} onChange={(v) => app.setPrefs({ shareMode: v ? 'area' : 'public' })} />
            <Row2 title="Nearby alerts" body="Notifications made on this phone while the app is open. No push token is collected." value={app.nearbyAlerts} onChange={app.setNearbyAlerts} />
            <Row2
              title="AI suggestions"
              body="Sends your questions, profile summary and the last 10 messages of a chat to Anthropic (Claude) to write suggestions. Off by default; built-in suggestions never leave your phone."
              value={app.aiShare}
              onChange={app.setAiShare}
            />
          </Card>
          <Button label="Open phone settings (location, notifications, photos)" variant="quiet" onPress={() => Linking.openSettings()} />
        </Section>

        <Section title="What we keep">
          <Text style={T.muted}>Your profile, photo, requests and messages stay until you delete them or your account. ID verification: we keep only the result (status and time), never your ID images or selfie. Stripe handles those and keeps them for up to a year under its policy.</Text>
          <LegalLinks ids={['privacy', 'cookies']} />
        </Section>

        <Section title="Your account">
          <Text style={T.muted}>For a copy of your data or any other request, email {CONTACT_LINE}.</Text>
          {app.session ? (
            <Button label="Delete my account" icon="trash-outline" variant="danger" onPress={() => router.push('/delete-account')} />
          ) : (
            <Button
              label="Clear data on this phone"
              variant="danger"
              onPress={() => Alert.alert('Clear this phone?', 'This removes your demo profile and settings from this phone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Clear', style: 'destructive', onPress: async () => { await app.reset(); router.replace('/onboarding'); } }])}
            />
          )}
        </Section>
        <LegalLinks ids={['terms', 'refunds']} />
      </ScrollView>
    </>
  );
}

function Row2({ title, body, value, onChange }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: S.md, alignItems: 'center' }}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={T.label} accessibilityElementsHidden importantForAccessibility="no">{title}</Text>
        <Text style={T.small} accessibilityElementsHidden importantForAccessibility="no">{body}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.accent, false: C.line2 }} accessibilityLabel={title} accessibilityHint={body} />
    </View>
  );
}
