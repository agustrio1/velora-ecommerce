import type { SeoOrgType } from '@velora/shared';
import type { SettingsPayload } from '../../../lib/api-types';

/**
 * The settings screen keeps one flat draft object so the tab nav can show a
 * single "unsaved changes" state, and so saving is one PATCH for every section.
 */

export interface SeoFormState {
  siteName: string;
  defaultTitle: string;
  defaultDescription: string;
  /** Homepage-only overrides; blank tells the storefront to compose from content. */
  homeTitle: string;
  homeDescription: string;
  keywords: string;
  canonicalBaseUrl: string;
  defaultOgImage: string;
  twitterHandle: string;
  robotsIndex: boolean;
  robotsFollow: boolean;
  jsonLdEnabled: boolean;
  organizationType: SeoOrgType;
  jsonLdExtra: string;
}

export interface SettingsForm {
  storeName: string;
  logo: string;
  email: string;
  whatsapp: string;
  instagram: string;
  tiktok: string;
  announcement: string;
  taxEnabled: boolean;
  taxPercent: string;
  expiryMinutes: string;
  couriers: string;
  freeShipThreshold: string;
  seo: SeoFormState;
}

export const EMPTY_FORM: SettingsForm = {
  storeName: '',
  logo: '',
  email: '',
  whatsapp: '',
  instagram: '',
  tiktok: '',
  announcement: '',
  taxEnabled: false,
  taxPercent: '11',
  expiryMinutes: '60',
  couriers: '',
  freeShipThreshold: '0',
  seo: {
    siteName: '',
    defaultTitle: '',
    defaultDescription: '',
    homeTitle: '',
    homeDescription: '',
    keywords: '',
    canonicalBaseUrl: '',
    defaultOgImage: '',
    twitterHandle: '',
    robotsIndex: true,
    robotsFollow: true,
    jsonLdEnabled: true,
    organizationType: 'OnlineStore',
    jsonLdExtra: '',
  },
};

/** store_settings rows arrive in two shapes: `{"value": x}` envelopes and plain docs. */
function unwrapSetting(raw: unknown): unknown {
  if (raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in (raw as Record<string, unknown>)) {
    return (raw as { value: unknown }).value;
  }
  return raw;
}

export function formFromPayload(payload: SettingsPayload): SettingsForm {
  const setting = (key: string): unknown => unwrapSetting(payload.settings.find((s) => s.key === key)?.value);
  const scalar = (key: string): string => {
    const value = setting(key);
    return value == null ? '' : String(value);
  };
  const social = (setting('social_media') ?? {}) as Record<string, string>;
  const announcement = (payload.announcement ?? {}) as { text?: string };
  const tax = (payload.tax ?? {}) as { enabled?: boolean; percent?: number };
  const order = (payload.order ?? {}) as { paymentExpiryMinutes?: number };
  const shipping = (payload.shipping ?? {}) as { couriers?: string; freeShippingThreshold?: number };
  const seo = payload.seo;

  return {
    storeName: scalar('store_name') || 'VELORA',
    logo: scalar('logo'),
    email: scalar('email'),
    whatsapp: scalar('whatsapp'),
    instagram: social.instagram ?? '',
    tiktok: social.tiktok ?? '',
    announcement: announcement.text ?? '',
    taxEnabled: Boolean(tax.enabled),
    taxPercent: String(tax.percent ?? 11),
    expiryMinutes: String(order.paymentExpiryMinutes ?? 60),
    couriers: shipping.couriers ?? '',
    freeShipThreshold: String(shipping.freeShippingThreshold ?? 0),
    seo: {
      siteName: seo?.siteName ?? '',
      defaultTitle: seo?.defaultTitle ?? '',
      defaultDescription: seo?.defaultDescription ?? '',
      homeTitle: seo?.homeTitle ?? '',
      homeDescription: seo?.homeDescription ?? '',
      keywords: seo?.keywords ?? '',
      canonicalBaseUrl: seo?.canonicalBaseUrl ?? '',
      defaultOgImage: seo?.defaultOgImage ?? '',
      twitterHandle: seo?.twitterHandle ?? '',
      robotsIndex: seo?.robotsIndex !== false,
      robotsFollow: seo?.robotsFollow !== false,
      jsonLdEnabled: seo?.jsonLdEnabled !== false,
      organizationType: seo?.organizationType ?? 'OnlineStore',
      jsonLdExtra: seo?.jsonLdExtra ?? '',
    },
  };
}

/** One PATCH for all sections; empty strings become null so URL/email fields stay valid. */
export function payloadFromForm(form: SettingsForm): Record<string, unknown> {
  const orNull = (value: string): string | null => value.trim() || null;
  const { seo } = form;
  return {
    store_name: form.storeName.trim(),
    logo: orNull(form.logo),
    whatsapp: orNull(form.whatsapp),
    email: orNull(form.email),
    social_media: { instagram: orNull(form.instagram), tiktok: orNull(form.tiktok) },
    announcement_bar: orNull(form.announcement),
    tax_settings: { enabled: form.taxEnabled, ratePercent: Number(form.taxPercent) || 0, includeInPrice: true },
    order_settings: { pendingExpiryMinutes: Number(form.expiryMinutes) || 60 },
    shipping_settings: {
      couriers: form.couriers.trim(),
      freeShippingThreshold: Number(form.freeShipThreshold) || 0,
    },
    seo_settings: {
      siteName: seo.siteName.trim(),
      defaultTitle: seo.defaultTitle.trim(),
      defaultDescription: seo.defaultDescription.trim(),
      homeTitle: seo.homeTitle.trim(),
      homeDescription: seo.homeDescription.trim(),
      keywords: seo.keywords.trim(),
      canonicalBaseUrl: orNull(seo.canonicalBaseUrl),
      defaultOgImage: orNull(seo.defaultOgImage),
      twitterHandle: orNull(seo.twitterHandle),
      robotsIndex: seo.robotsIndex,
      robotsFollow: seo.robotsFollow,
      jsonLdEnabled: seo.jsonLdEnabled,
      organizationType: seo.organizationType,
      jsonLdExtra: orNull(seo.jsonLdExtra),
    },
  };
}

/** Client-side gate before the PATCH: the API re-validates everything anyway. */
export function validateForm(form: SettingsForm): string | null {
  if (form.storeName.trim().length < 2) return 'Nama toko minimal 2 karakter.';
  if (form.email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) {
    return 'Email toko tidak valid.';
  }
  if (form.seo.canonicalBaseUrl.trim() && !/^https?:\/\/[^\s]+$/i.test(form.seo.canonicalBaseUrl.trim())) {
    return 'URL kanonik harus diawali http:// atau https://.';
  }
  return null;
}
