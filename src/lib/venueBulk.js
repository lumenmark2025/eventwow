function cleanText(value) {
  return String(value || "").trim();
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

export function slugifyVenueText(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function isValidHttpUrl(value) {
  const raw = cleanText(value);
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function splitCsvLine(line) {
  const out = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  out.push(current);
  return out.map((v) => v.trim());
}

export function parseVenueCsv(text) {
  const source = String(text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], error: "CSV is empty." };

  const header = splitCsvLine(lines[0]).map((v) => normalize(v));
  const indexByKey = new Map(header.map((key, idx) => [key, idx]));
  const required = ["name", "url", "town"];
  const missing = required.filter((key) => !indexByKey.has(key));
  if (missing.length) {
    return { rows: [], error: `Missing required header(s): ${missing.join(", ")}` };
  }

  const rows = lines.slice(1).map((line, rowIndex) => {
    const cells = splitCsvLine(line);
    const name = cleanText(cells[indexByKey.get("name")] || "");
    const url = cleanText(cells[indexByKey.get("url")] || "");
    const town = cleanText(cells[indexByKey.get("town")] || "");
    const type = cleanText(cells[indexByKey.get("type")] || "");
    const errors = [];
    if (!name) errors.push("Name is required");
    if (!town) errors.push("Town is required");
    if (!isValidHttpUrl(url)) errors.push("URL must be a valid http/https URL");

    return {
      rowNumber: rowIndex + 2,
      name,
      url,
      town,
      type,
      errors,
    };
  });

  return { rows, error: "" };
}

export function inferVenueTypeName({ name, url }) {
  const text = `${normalize(name)} ${normalize(url)}`;
  if (!text.trim()) return "";

  if (/\b(hotel|inn|resort|lodge)\b/.test(text)) return "Hotel";
  if (/\bbarn\b/.test(text)) return "Wedding Barn";
  if (/\bcastle\b/.test(text)) return "Castle";
  if (/\bfarm\b/.test(text)) return "Farm";
  if (/\b(manor|country house|estate)\b/.test(text)) return "Manor House";
  if (/\bhouse\b/.test(text) && !/\b(village hall|hall)\b/.test(text)) return "Manor House";
  if (/\bhall\b/.test(text) && !/\b(manor|estate|country house)\b/.test(text)) return "Village Hall";
  return "";
}

export function findVenueTypeByName(types, name) {
  const target = normalize(name);
  if (!target) return null;
  return (types || []).find((t) => normalize(t?.name) === target) || null;
}

export function buildVenueDuplicateKey(name, town) {
  return `${normalize(name)}|${normalize(town)}`;
}
