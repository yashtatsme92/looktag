export type GoogleSocial = { clientId: string; clientSecret: string };

export type AppleSocial = {
  clientId: string;
  clientSecret: string;
  appBundleIdentifier?: string;
};

export type SocialProviders = {
  google?: GoogleSocial;
  apple?: AppleSocial;
};
