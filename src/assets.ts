// 双端图片资源加载器（同时支持微信小游戏 wx.createImage 与浏览器 Image）

interface WechatImageGlobal {
  createImage?(): HTMLImageElement;
}

declare const wx: WechatImageGlobal | undefined;

export interface LoadedImage {
  el: HTMLImageElement;
  ready: boolean;
}

export interface GameAssets {
  bg: LoadedImage;
  avatarP1: LoadedImage;
  avatarP2: LoadedImage;
  cats: Array<{
    lv1: LoadedImage;
    lv2: LoadedImage;
    animLv1: LoadedImage;
    animLv2: LoadedImage;
  }>;
  bosses: {
    orange: LoadedImage;
    cow: LoadedImage;
    hakimi: LoadedImage;
  };
  relics: {
    blast: LoadedImage;
    merge: LoadedImage;
    collapse: LoadedImage;
  };
}

function loadImage(src: string): LoadedImage {
  const el =
    typeof wx !== 'undefined' && typeof wx.createImage === 'function'
      ? wx.createImage()
      : new Image();
  const entry: LoadedImage = { el, ready: false };
  el.onload = () => {
    entry.ready = true;
  };
  el.src = src;
  return entry;
}

export function loadGameAssets(): GameAssets {
  return {
    bg: loadImage('assets/bg_catroom.jpg'),
    avatarP1: loadImage('assets/ui/avatar_p1.png'),
    avatarP2: loadImage('assets/ui/avatar_p2.png'),
    cats: [0, 1, 2, 3].map((color) => ({
      lv1: loadImage(`assets/cats/cat_${color}_lv1.png`),
      lv2: loadImage(`assets/cats/cat_${color}_lv2.png`),
      animLv1: loadImage(`assets/cats/anim_cat_${color}_lv1.png`),
      animLv2: loadImage(`assets/cats/anim_cat_${color}_lv2.png`),
    })),
    bosses: {
      orange: loadImage('assets/bosses/boss_orange.png'),
      cow: loadImage('assets/bosses/boss_cow.png'),
      hakimi: loadImage('assets/bosses/boss_hakimi.png'),
    },
    relics: {
      blast: loadImage('assets/relics/relic_blast.png'),
      merge: loadImage('assets/relics/relic_merge.png'),
      collapse: loadImage('assets/relics/relic_collapse.png'),
    },
  };
}
