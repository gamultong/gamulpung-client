export type AsideType = {
  [key: string]: AsideItem;
};

export type LangType = {
  [key: string]: string;
};

export type AsideItem = {
  link: string;
} & LangType;
