export const Click = {
  GENERAL_CLICK: 'GENERAL_CLICK',
  SPECIAL_CLICK: 'SPECIAL_CLICK',
} as const;

export type ClickType = (typeof Click)[keyof typeof Click];
