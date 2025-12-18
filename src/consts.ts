interface Badge {
  id: string;
  version: string;
  imageUrl: string;
  title: string;
}

export type Site = {
  TITLE: string
  DESCRIPTION: string
  EMAIL: string
  VODS_PER_PAGE: number
  SITEURL: string
  TWITCH_USER_ID: number
}

export type Link = {
  href: string
  label: string
}

export const SITE: Site = {
  TITLE: 'vods.rcw.lol',
  DESCRIPTION:
    'A fully featured archive of my past livestreams, including chat replay, search, date sorting and game sorting.',
  EMAIL: 'riley@rcw.lol',
  VODS_PER_PAGE: 21,
  SITEURL: 'https://vods.rcw.lol',
  TWITCH_USER_ID: 194814599
}

export const NAV_LINKS: Link[] = [
  /*
  { href: 'https://ltwilson.tv', label: 'Blog' },
  { href: 'https://twitch.tv/theltwilson', label: 'Twitch' },
  { href: 'https://github.com/theltwilson', label: 'GitHub' }
   */
]

export const FOOTER_LINKS: Link[] = [
  { href: 'https://gitlab.com/rcw.lol/vods', label: 'GitLab' },
  { href: 'riley@rcw.lol', label: 'Email' },
  { href: '/rss.xml', label: 'RSS' },
]


export const BADGES: Record<string, Badge> = {
  broadcaster: {
    id: 'broadcaster',
    version: '1',
    imageUrl: 'https://static-cdn.jtvnw.net/badges/v1/5527c58c-fb7d-422d-b71b-f309dcb85cc1/1',
    title: 'Broadcaster',
  },
  moderator: {
    id: 'moderator',
    version: '1',
    imageUrl: 'https://static-cdn.jtvnw.net/badges/v1/3267646d-33f0-4b17-b3df-f923a41db1d0/1',
    title: 'Moderator',
  },
  vip: {
    id: 'vip',
    version: '1',
    imageUrl: 'https://static-cdn.jtvnw.net/badges/v1/b817aba4-fad8-49e2-b88a-7cc744dfa6ec/1',
    title: 'VIP',
  },
};

export type BadgeId = keyof typeof BADGES;