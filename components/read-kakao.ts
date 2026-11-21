export interface ChatLine {
  seq: number;
  sender: string;
  date: string | null;
  time: string | null;
  text: string;
}

const MOBILE_DATE =
  /^-{5,}\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일[^-]*-{5,}\s*$/;
const PC_DATE = /^(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s+\S요일\s*$/;
const MOBILE_MSG =
  /^\[(.+?)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s*(.*)$/;
const PC_MSG =
  /^(\d{4})[년.\s]*(\d{1,2})[월.\s]*(\d{1,2})\.?\s*(오전|오후)\s*(\d{1,2}):(\d{2}),\s*(.+?)\s*:\s*(.*)$/;

function isoDate(year: string, month: string, day: string) {
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function readKakao(raw: string): { participants: string[]; lines: ChatLine[] } {
  const lines: ChatLine[] = [];
  let currentDate: string | null = null;

  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const mobileDate = line.match(MOBILE_DATE);
    const pcDate = line.match(PC_DATE);
    if (mobileDate) {
      currentDate = isoDate(mobileDate[1], mobileDate[2], mobileDate[3]);
      continue;
    }
    if (pcDate && !line.includes(",")) {
      currentDate = isoDate(pcDate[1], pcDate[2], pcDate[3]);
      continue;
    }

    const mobile = line.match(MOBILE_MSG);
    if (mobile) {
      lines.push({
        seq: lines.length + 1,
        sender: mobile[1],
        date: currentDate,
        time: `${mobile[2]} ${mobile[3]}:${mobile[4]}`,
        text: mobile[5],
      });
      continue;
    }

    const pc = line.match(PC_MSG);
    if (pc) {
      currentDate = isoDate(pc[1], pc[2], pc[3]);
      lines.push({
        seq: lines.length + 1,
        sender: pc[7],
        date: currentDate,
        time: `${pc[4]} ${pc[5]}:${pc[6]}`,
        text: pc[8],
      });
      continue;
    }

    const last = lines[lines.length - 1];
    if (last) last.text = `${last.text}\n${line}`;
  }

  const participants = [...new Set(lines.map((line) => line.sender))].filter(
    (name) => name && !name.includes("들어왔습니다") && !name.includes("나갔습니다"),
  );

  return { participants, lines };
}
