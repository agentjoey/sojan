/**
 * 「出生时间按哪个时区记录」（EP-tz-edge）。
 *
 * 起盘时的时区来自出生地坐标（tz-lookup）。绝大多数地方地理时区就是钟表时间的时区；
 * 例外是新疆：tzdata 给 `Asia/Urumqi`（UTC+6，即「新疆时间」），而官方时间、户口与
 * 出生证明用的都是北京时间（UTC+8），民间也有人按新疆时间记。两者差 2 小时，足以换时辰
 * 乃至换日，而且八字/紫微（真太阳时）与西方盘（钟表时）两边都会偏——所以这类时区必须让
 * 用户显式确认，默认取官方时间（第一个选项）。
 *
 * 选中的时区直接写进 `BirthInput.timezone`：normalizeBirth 的 UTC 偏移（含北京时间
 * 1986–1991 的夏令时）就按它取，无需另加字段。
 */
export type RecordedTimezoneChoice = {
  timezone: string;
  /** official = 当地官方/证件使用的时间；local = 按当地地理时区的民间时间 */
  kind: "official" | "local";
};

const XINJIANG = (local: string): RecordedTimezoneChoice[] => [
  { timezone: "Asia/Shanghai", kind: "official" },
  { timezone: local, kind: "local" },
];

const CHOICES: Record<string, RecordedTimezoneChoice[]> = {
  "Asia/Urumqi": XINJIANG("Asia/Urumqi"),
  // tzdata 的 backward 链接，部分数据源仍会给出
  "Asia/Kashgar": XINJIANG("Asia/Kashgar"),
};

/** 地理时区有歧义时返回可选的记录时区（默认项在首位）；否则 null。 */
export function recordedTimezoneChoices(geoTimezone: string): RecordedTimezoneChoice[] | null {
  return CHOICES[geoTimezone] ?? null;
}

/** 未经用户确认时应采用的记录时区：有歧义取官方时间，否则就是地理时区本身。 */
export function defaultRecordedTimezone(geoTimezone: string): string {
  return recordedTimezoneChoices(geoTimezone)?.[0]?.timezone ?? geoTimezone;
}
