export const GREGORIAN_START_JD = 2_405_160 // 1873-01-01 (グレゴリオ暦) = 明治改暦日
export const GREGORIAN_START_YEAR = 1873
export const IMPERIAL_START_JD = 1_480_041 // -660-02-11 (先発グレゴリオ暦) = 神武天皇即位
export const IMPERIAL_START_YEAR = -660
export const COMMON_ERA_START_JD = 1_721_424 // 0001-01-01 (ユリウス暦) = 擬似元号「西暦」の開始
export const ITALY_REFORM_JD = 2_299_161 // 1582-10-15 (グレゴリオ暦)。Ruby Date::ITALY の改暦日
// Ruby の DAY_MAX (Bignum) / DATE_INFINITY.jd の代替。「終端なし」の比較にのみ使う
export const JD_MAX = Number.MAX_SAFE_INTEGER

export const WESTERN_ERA_NAMES: readonly string[] = ['', '西暦', '紀元前']
export const IMPERIAL_ERA_NAMES: readonly string[] = ['皇紀', '神武天皇即位紀元']

export const ALT_MONTH_NAME: readonly string[] = [
  '睦月', '如月', '弥生', '卯月', '皐月', '水無月',
  '文月', '葉月', '長月', '神無月', '霜月', '師走',
]

// 新字体 → 旧字体・異体字 (Ruby KANJI_VARIANTS)。値のうち CJK 互換漢字
// (U+FA19 神 など) はエディタ・ツールの NFC 正規化で通常字に潰れて別の
// コードポイントになるため、必ず \u エスケープで書くこと。
export const KANJI_VARIANTS: Record<string, string> = {
  '宝': '寳',
  '霊': '靈',
  '神': '\uFA19',
  '応': '應',
  '暦': '曆',
  '祥': '\uFA1A',
  '寿': '壽',
  '斎': '斉',
  '観': '觀',
  '寛': '寬',
  '徳': '德',
  '禄': '祿',
  '万': '萬',
  '福': '\uFA1B',
  '禎': '\uFA53',
  '国': '國',
  '亀': '龜',
  '令': '\uF9A8',
}

export const SQUARE_ERAS: Record<string, string> = {
  '㍾': '明治',
  '㍽': '大正',
  '㍼': '昭和',
  '㍻': '平成',
  '㋿': '令和',
}

export const NUM_CHARS =
  '零壱壹弌弐貳貮参參弎肆伍陸漆質柒捌玖〇一二三四五六七八九十拾什卄廿卅丗卌百陌佰皕阡仟千万萬億兆京垓0123456789０１２３４５６７８９'
