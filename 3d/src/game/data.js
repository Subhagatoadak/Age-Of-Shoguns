// Game rules. Logic runs on a 3000 x 2000 grid (1 unit = 10 cm); rendering scales by S into metres.
export const WW = 3000, WH = 2000, S = 0.1;
export const LAKE = { x: 1400, y: 1110, rx: 220, ry: 120 };
export const ROAD = [[520, 1480], [1200, 1200], [1800, 840], [2480, 440]];   // castle-to-castle trade road
export const TEAMC = [0x2f5fc4, 0xc0352a];

export const COST = {
  vil: { food: 50 }, spear: { food: 60, gold: 20 }, archer: { wood: 40, gold: 40 }, samurai: { food: 80, gold: 70 },
  monk: { gold: 90 }, cav: { food: 90, gold: 60 },
  house: { wood: 30 }, farm: { wood: 60 }, store: { wood: 100 }, barracks: { wood: 150 }, tower: { wood: 80, gold: 40 },
  smith: { wood: 130 }, temple: { wood: 120, gold: 60 }, stable: { wood: 160 }, market: { wood: 150 },
  pagoda: { wood: 450, gold: 350, food: 250 }, ranch: { wood: 120, food: 60 },
};
export const UT = {
  vil: { hp: 40, spd: 44, atk: 3, rng: 14, cd: 1.2, train: 7, name: 'Villager' },
  spear: { hp: 75, spd: 47, atk: 8, rng: 18, cd: 1.1, train: 9, name: 'Ashigaru spearman' },
  archer: { hp: 45, spd: 44, atk: 6, rng: 150, cd: 1.6, train: 10, name: 'Archer' },
  samurai: { hp: 150, spd: 46, atk: 15, rng: 18, cd: 1.3, train: 14, name: 'Samurai' },
  monk: { hp: 38, spd: 42, atk: 0, rng: 70, cd: 1.0, train: 12, name: 'Sohei monk', heal: 7 },
  cav: { hp: 125, spd: 78, atk: 10, rng: 22, cd: 1.15, train: 14, name: 'Mounted samurai' },
  cit: { hp: 30, spd: 26, atk: 0, rng: 10, cd: 1, train: 0, name: 'Townsfolk' },
  cow: { hp: 60, spd: 9, atk: 0, rng: 0, cd: 1, train: 0, name: 'Cattle' },
  deer: { hp: 30, spd: 60, atk: 0, rng: 0, cd: 1, train: 0, name: 'Deer' },
};
// w,h = footprint in logic units
export const BT = {
  tc: { w: 130, h: 96, hp: 1400, build: 60, name: 'Castle' },
  house: { w: 52, h: 46, hp: 250, build: 9, name: 'House' },
  farm: { w: 76, h: 76, hp: 150, build: 7, name: 'Rice paddy' },
  store: { w: 58, h: 52, hp: 400, build: 14, name: 'Storehouse' },
  barracks: { w: 108, h: 74, hp: 800, build: 24, name: 'Barracks' },
  tower: { w: 42, h: 42, hp: 700, build: 20, name: 'Watchtower' },
  smith: { w: 72, h: 56, hp: 550, build: 16, name: 'Blacksmith' },
  temple: { w: 90, h: 66, hp: 700, build: 26, name: 'Temple' },
  stable: { w: 100, h: 62, hp: 700, build: 22, name: 'Stable' },
  market: { w: 84, h: 62, hp: 600, build: 20, name: 'Market' },
  pagoda: { w: 76, h: 76, hp: 2400, build: 80, name: 'Great Pagoda' },
  ranch: { w: 116, h: 92, hp: 400, build: 16, name: 'Cattle ranch' },
};
export const TECH = {
  tools: { at: 'store', cost: { food: 80, wood: 100 }, time: 20, name: 'Iron tools', desc: 'villagers gather 25% faster' },
  steel: { at: 'smith', cost: { food: 100, gold: 90 }, time: 25, name: 'Tamahagane steel', desc: '+30% soldier attack' },
  armor: { at: 'smith', cost: { food: 120, gold: 110 }, time: 30, name: 'Lamellar armour', desc: '+35% soldier HP' },
  fletch: { at: 'smith', cost: { wood: 110, gold: 70 }, time: 22, name: 'Fletching', desc: '+45 archer and tower range' },
  masonry: { at: 'tc', cost: { wood: 150, gold: 60 }, time: 25, name: 'Masonry', desc: '+40% building HP, towers fire faster' },
  zen: { at: 'temple', cost: { gold: 140, food: 60 }, time: 28, name: 'Zen discipline', desc: 'all units slowly regenerate' },
};
export const TRAIN = { tc: ['vil'], barracks: ['spear', 'archer', 'samurai'], temple: ['monk'], stable: ['cav'] };
export const REQ = { samurai: 'smith', pagoda: 'temple', stable: 'barracks' };
export const BUILD_LIST = ['house', 'farm', 'ranch', 'store', 'barracks', 'tower', 'smith', 'temple', 'stable', 'market', 'pagoda'];
export const GARRISON = { tc: 15, tower: 5 };
export const DIFF = {
  easy: { name: 'Easy', first: 240, size: .7, gap: 1.2, res: 1.3, atk: .85, techW: [6, 10], blurb: 'slower, smaller raids' },
  normal: { name: 'Normal', first: 170, size: 1, gap: 1, res: 1, atk: 1, techW: [4, 7], blurb: 'the classic campaign' },
  hard: { name: 'Hard', first: 120, size: 1.4, gap: .8, res: .8, atk: 1.15, techW: [2, 5], blurb: 'for true warlords' },
};
export const FORESTS = [[260, 1250, 22, 120], [820, 1780, 14, 90], [1200, 1300, 26, 150], [1600, 800, 30, 170], [2100, 1500, 30, 170],
  [2800, 820, 20, 120], [2050, 200, 22, 130], [900, 500, 30, 190], [300, 600, 18, 120], [2700, 1700, 24, 150], [1500, 1850, 18, 110]];
export const WONDER_T = 180, DAY = 300;
export const NC = 20, NW = Math.ceil(WW / NC), NH = Math.ceil(WH / NC);

// ---- Ages (Rise of Nations style): research at the castle to unlock the next tier
export const AGES = [
  { name: 'Village Age', short: 'Village' },
  { name: 'Feudal Age', short: 'Feudal', cost: { food: 300, wood: 200 }, time: 30, pop: 10 },
  { name: 'Castle Age', short: 'Castle', cost: { food: 600, gold: 350 }, time: 40, pop: 15 },
  { name: 'Shogunate Age', short: 'Shogunate', cost: { food: 900, wood: 500, gold: 700 }, time: 50, pop: 20 },
];
// minimum age for each building, unit and technology
export const AGE_REQ = {
  house: 0, farm: 0, ranch: 1, store: 0, barracks: 0, tower: 1, market: 1, smith: 1, temple: 2, stable: 2, pagoda: 3,
  vil: 0, spear: 0, archer: 1, samurai: 2, monk: 2, cav: 2,
  tools: 0, steel: 1, fletch: 1, armor: 2, masonry: 2, zen: 2,
};
// ---- National borders: how far each building projects territory (logic units)
export const BORDER = { ranch: 150, tc: 520, tower: 320, barracks: 240, temple: 240, pagoda: 260, store: 200, market: 220, smith: 200, stable: 220, house: 170, farm: 110 };
export const ATTRITION = .35;          // hp per second for soldiers inside enemy borders
// ---- Raid settings the player can change (seconds; gap null = automatic, speeding up each raid)
export const RAID_DEFAULT = { on: true, first: null, gap: null, size: 1 };

// ---- Calendar: the year turns as you play. Old Japanese months; months 1-3 are spring.
export const YEAR_LEN = 480, START_YEAR = 1560, START_MONTH = 2;
export const MONTHS = ['Mutsuki', 'Kisaragi', 'Yayoi', 'Uzuki', 'Satsuki', 'Minazuki', 'Fumizuki', 'Hazuki', 'Nagatsuki', 'Kannazuki', 'Shimotsuki', 'Shiwasu'];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
// ---- Society
export const HOUSE_CAP = 5, CASTLE_CAP = 6;
export const FAMILY_NAMES = ['Tanaka', 'Suzuki', 'Takahashi', 'Watanabe', 'Ito', 'Yamamoto', 'Nakamura', 'Kobayashi', 'Kato', 'Yoshida', 'Yamada', 'Sasaki', 'Matsumoto', 'Inoue', 'Kimura', 'Hayashi', 'Shimizu', 'Mori', 'Ikeda', 'Hashimoto', 'Ishikawa', 'Ogawa', 'Fujita', 'Okada'];
export const MALE_NAMES = ['Taro', 'Jiro', 'Saburo', 'Ichiro', 'Kenta', 'Hayato', 'Daisuke', 'Goro', 'Heihachi', 'Kanbei', 'Kyuzo', 'Masaru', 'Nobu', 'Rokuro', 'Sukeroku', 'Tadashi', 'Yohei', 'Zenkichi'];
export const FEMALE_NAMES = ['Hana', 'Aiko', 'Chiyo', 'Fumi', 'Haru', 'Kiku', 'Masa', 'Natsu', 'O-Tsuru', 'Sayo', 'Shizu', 'Take', 'Tama', 'Ume', 'Yae', 'Yuki', 'Kaede', 'Sakura'];
export const TAX = [{ name: 'Low', gold: .45, mood: 8 }, { name: 'Fair', gold: 1, mood: 0 }, { name: 'Heavy', gold: 1.7, mood: -14 }];
export const FESTIVAL = { cost: { food: 120, gold: 40 }, time: 40 };
