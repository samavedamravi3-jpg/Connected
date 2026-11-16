import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { EventCategory } from './types';

type Icon = ComponentProps<typeof Ionicons>['name'];

/** Muted colour and outline icon for each event category, used for map pins, category labels and image placeholders. */
export const EVENT_STYLE: Record<EventCategory, { label: string; icon: Icon; solid: string; soft: string }> = {
  networking: { label: 'Networking', icon: 'people-outline', solid: '#2F5D7C', soft: '#E4ECF2' },
  career: { label: 'Career', icon: 'briefcase-outline', solid: '#8A4B2C', soft: '#F3E7DF' },
  hackathon: { label: 'Hackathon', icon: 'code-slash-outline', solid: '#55602A', soft: '#ECEEDD' },
};
