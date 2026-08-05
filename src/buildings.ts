/**
 * Offline dataset of UCLA buildings that show up in the Schedule of Classes
 * location column, plus the matching and distance helpers behind estimate_walk_time.
 *
 * Names and abbreviations follow the registrar's official building list
 * (registrar.ucla.edu/faculty-staff/classrooms-and-scheduling/building-list);
 * `name` is spelled the way the SoC prints it, `abbreviation` is the OASIS short
 * form, and `aliases` cover the other spellings people actually type.
 *
 * Coordinates are APPROXIMATE building centroids (~4 decimal places, tens of
 * metres). They are good enough for "can I make it across campus in 10 minutes"
 * and nothing else -- no network access, no routing, no elevation.
 */

export interface Building {
  name: string;
  abbreviation: string | null;
  aliases: string[];
  lat: number;
  lon: number;
}

/** Typical walking pace on campus, metres per minute (~3 mph). */
const WALK_SPEED_M_PER_MIN = 80;
/** Straight-line distance is multiplied by this to approximate path length. */
const PATH_FACTOR = 1.4;

export const BUILDINGS: Building[] = [
  // ------------------------------------------------- North Campus / Royce quad
  { name: "Royce Hall", abbreviation: "ROYCE", aliases: [], lat: 34.0729, lon: -118.4422 },
  { name: "Powell Library Building", abbreviation: "POWELL", aliases: ["Powell Library", "Powell"], lat: 34.0716, lon: -118.4422 },
  { name: "Haines Hall", abbreviation: "HAINES", aliases: [], lat: 34.0729, lon: -118.4413 },
  { name: "Renee and David Kaplan Hall", abbreviation: "KAPLAN", aliases: ["Kaplan Hall", "Humanities Building", "Humanities"], lat: 34.0715, lon: -118.4413 },
  { name: "Rolfe Hall", abbreviation: "ROLFE", aliases: [], lat: 34.0739, lon: -118.4421 },
  { name: "Dodd Hall", abbreviation: "DODD", aliases: [], lat: 34.0728, lon: -118.4393 },
  { name: "Bunche Hall", abbreviation: "BUNCHE", aliases: [], lat: 34.0743, lon: -118.4404 },
  { name: "Public Affairs Building", abbreviation: "PUB AFF", aliases: ["Public Affairs", "Luskin School of Public Affairs", "Luskin"], lat: 34.0744, lon: -118.4392 },
  { name: "Perloff Hall", abbreviation: "PERLOFF", aliases: [], lat: 34.0734, lon: -118.4402 },
  { name: "Broad Art Center", abbreviation: "BROAD", aliases: ["Eli and Edythe Broad Art Center"], lat: 34.0759, lon: -118.4410 },
  { name: "Macgowan Hall", abbreviation: "MACGOWN", aliases: ["MacGowan Hall"], lat: 34.0759, lon: -118.4399 },
  { name: "Macgowan Hall East", abbreviation: "MCGWN E", aliases: ["MacGowan East"], lat: 34.0761, lon: -118.4393 },
  { name: "Melnitz Hall", abbreviation: "MELNITZ", aliases: ["James Bridges Theater"], lat: 34.0763, lon: -118.4400 },
  { name: "Schoenberg Music Building", abbreviation: "SMB", aliases: ["Schoenberg Hall", "Schoenberg"], lat: 34.0707, lon: -118.4402 },
  { name: "Ostin Music Center", abbreviation: "OSTIN", aliases: ["Evelyn and Mo Ostin Music Center", "Ostin"], lat: 34.0704, lon: -118.4405 },
  { name: "Kaufman Hall", abbreviation: "KAUFMAN", aliases: ["Glorya Kaufman Hall", "Dance Building"], lat: 34.0728, lon: -118.4441 },
  { name: "Fowler Museum at UCLA", abbreviation: "FOWLER", aliases: ["Fowler Museum", "Fowler"], lat: 34.0730, lon: -118.4432 },
  { name: "Moore Hall", abbreviation: "MOORE", aliases: [], lat: 34.0704, lon: -118.4427 },
  { name: "Franz Hall", abbreviation: "FRANZ", aliases: [], lat: 34.0696, lon: -118.4415 },
  { name: "Pritzker Hall", abbreviation: "PRITZKER", aliases: ["Psychology Tower", "Psychology Building"], lat: 34.0696, lon: -118.4408 },
  { name: "Murphy Hall", abbreviation: "MURPHY", aliases: ["Administration Building"], lat: 34.0716, lon: -118.4387 },
  { name: "Law Building", abbreviation: "LAW", aliases: ["School of Law", "UCLA School of Law"], lat: 34.0730, lon: -118.4386 },
  { name: "Young Research Library", abbreviation: "YRL", aliases: ["Charles E. Young Research Library"], lat: 34.0749, lon: -118.4415 },
  { name: "Graduate School of Education and Information Studies Building", abbreviation: "GSEIS", aliases: ["GSE&IS Building", "Education Building"], lat: 34.0751, lon: -118.4422 },
  { name: "Lu Valle Commons", abbreviation: "LUVALLE", aliases: ["LuValle Commons"], lat: 34.0736, lon: -118.4392 },
  { name: "Sculpture Garden", abbreviation: "SCULPT", aliases: ["Franklin D. Murphy Sculpture Garden"], lat: 34.0750, lon: -118.4401 },
  { name: "Portola Plaza Building", abbreviation: "PORTOLA", aliases: ["Institute for Pure and Applied Mathematics", "IPAM"], lat: 34.0703, lon: -118.4419 },

  // ---------------------------------------------- South Campus / Court of Sciences
  { name: "Boelter Hall", abbreviation: "BOELTER", aliases: ["Boelter"], lat: 34.0689, lon: -118.4430 },
  { name: "Mathematical Sciences", abbreviation: "MS", aliases: ["Math Sciences", "Mathematical Sciences Building", "Math Sci"], lat: 34.0695, lon: -118.4428 },
  { name: "Engineering IV", abbreviation: "ENGR IV", aliases: ["Engineering 4"], lat: 34.0688, lon: -118.4440 },
  { name: "Engineering V", abbreviation: "ENGR V", aliases: ["Engineering 5"], lat: 34.0695, lon: -118.4438 },
  { name: "Engineering VI", abbreviation: "ENGR VI", aliases: ["Engineering 6", "Mong Learning Center"], lat: 34.0695, lon: -118.4443 },
  { name: "Knudsen Hall", abbreviation: "KNUDSEN", aliases: [], lat: 34.0706, lon: -118.4413 },
  { name: "Kinsey Science Teaching Pavilion", abbreviation: "KNSY PV", aliases: ["Kinsey Teaching Pavilion", "Kinsey Pavilion", "Kinsey"], lat: 34.0702, lon: -118.4413 },
  { name: "Physics and Astronomy Building", abbreviation: "PAB", aliases: ["Physics & Astronomy Building", "Physics and Astronomy"], lat: 34.0707, lon: -118.4416 },
  { name: "Geology Building", abbreviation: "GEOLOGY", aliases: ["Geology"], lat: 34.0692, lon: -118.4412 },
  { name: "Slichter Hall", abbreviation: "SLICHTR", aliases: [], lat: 34.0689, lon: -118.4408 },
  { name: "Young Hall", abbreviation: "WGYOUNG", aliases: ["William G. Young Hall", "Young Hall CS"], lat: 34.0686, lon: -118.4413 },
  { name: "Molecular Sciences Building", abbreviation: "MOL SCI", aliases: ["Molecular Sciences"], lat: 34.0682, lon: -118.4409 },
  { name: "Boyer Hall", abbreviation: "BOYER", aliases: ["Paul D. Boyer Hall"], lat: 34.0681, lon: -118.4418 },
  { name: "Life Sciences", abbreviation: "LS", aliases: ["Life Sciences Building"], lat: 34.0671, lon: -118.4425 },
  { name: "Terasaki Life Sciences Building", abbreviation: "TERASKI", aliases: ["Terasaki Life Sciences", "Terasaki"], lat: 34.0672, lon: -118.4401 },
  { name: "Hershey Hall", abbreviation: "HERSHEY", aliases: [], lat: 34.0669, lon: -118.4399 },
  { name: "Botany Building", abbreviation: "BOTANY", aliases: ["La Kretz Botany Building", "Botany"], lat: 34.0668, lon: -118.4411 },
  { name: "La Kretz Hall", abbreviation: "LAKRETZ", aliases: [], lat: 34.0676, lon: -118.4427 },
  { name: "La Kretz Garden Pavillion", abbreviation: "LKGP", aliases: ["La Kretz Garden Pavilion"], lat: 34.0668, lon: -118.4415 },
  { name: "Court of Sciences Student Center", abbreviation: null, aliases: ["Court of Sciences"], lat: 34.0682, lon: -118.4422 },
  { name: "California NanoSystems Institute", abbreviation: "CNSI", aliases: ["California Nanosystems Institute"], lat: 34.0681, lon: -118.4430 },

  // ------------------------------------------------------------ Health Sciences
  { name: "Center for the Health Sciences", abbreviation: "HLTHSCI", aliases: ["Center for Health Sciences", "CHS"], lat: 34.0662, lon: -118.4431 },
  { name: "Factor Health Sciences Building", abbreviation: "FACTOR", aliases: ["Factor Building", "Factor"], lat: 34.0668, lon: -118.4420 },
  { name: "Gonda (Goldschmied) Neuroscience and Genetics Research Center", abbreviation: "GONDA", aliases: ["Gonda Neuroscience and Genetics Research Center", "Gonda Center", "Gonda"], lat: 34.0674, lon: -118.4447 },
  { name: "Neuroscience Research Building", abbreviation: "NEUROSC", aliases: [], lat: 34.0674, lon: -118.4433 },
  { name: "MacDonald Medical Research Laboratories", abbreviation: "MACDNLD", aliases: ["MacDonald Medical Research Laboratory"], lat: 34.0674, lon: -118.4441 },
  { name: "Brain Research Institute", abbreviation: "BRI", aliases: [], lat: 34.0663, lon: -118.4443 },
  { name: "Brain Mapping Center", abbreviation: "BMC", aliases: ["Ahmanson-Lovelace Brain Mapping Center"], lat: 34.0667, lon: -118.4444 },
  { name: "Semel Institute for Neuroscience and Human Behavior", abbreviation: "SEMEL", aliases: ["Semel Institute"], lat: 34.0658, lon: -118.4445 },
  { name: "Reed Neurological Research Center", abbreviation: "REED", aliases: ["Reed Neurological"], lat: 34.0662, lon: -118.4448 },
  { name: "Rosenfeld Hall", abbreviation: null, aliases: [], lat: 34.0667, lon: -118.4448 },
  { name: "Public Health, School of", abbreviation: "PUB HLT", aliases: ["School of Public Health", "Fielding School of Public Health"], lat: 34.0667, lon: -118.4436 },
  { name: "Dentistry, School of", abbreviation: "DENT", aliases: ["School of Dentistry"], lat: 34.0664, lon: -118.4420 },
  { name: "Biomedical Sciences Research Building", abbreviation: "BIO SCI", aliases: ["BSRB"], lat: 34.0666, lon: -118.4446 },
  { name: "Geffen Hall", abbreviation: "GEFFENHL", aliases: ["David Geffen Hall"], lat: 34.0645, lon: -118.4422 },
  { name: "Wasserman Building", abbreviation: "WASSRMN", aliases: [], lat: 34.0653, lon: -118.4446 },
  { name: "Ueberroth Building", abbreviation: "PVUB", aliases: ["Peter V. Ueberroth Building"], lat: 34.0640, lon: -118.4470 },
  { name: "Marion Davies Children's Center", abbreviation: "MDCC", aliases: ["Marion Davies Children's Health Center"], lat: 34.0652, lon: -118.4424 },
  { name: "Morton Medical Building", abbreviation: "MORTON", aliases: ["Peter Morton Medical Building"], lat: 34.0652, lon: -118.4465 },
  { name: "Orthopedic Hospital Research Center", abbreviation: "OHRC", aliases: ["Orthopaedic Hospital Research Center"], lat: 34.0673, lon: -118.4413 },
  { name: "700 Westwood Plaza", abbreviation: "700 WWP", aliases: [], lat: 34.0665, lon: -118.4452 },

  // -------------------------------------------------------- Central / student life
  { name: "Ackerman Student Union", abbreviation: "AU", aliases: ["Ackerman Union", "Ackerman"], lat: 34.0704, lon: -118.4443 },
  { name: "Kerckhoff Hall", abbreviation: "KH", aliases: ["Kerckhoff"], lat: 34.0704, lon: -118.4435 },
  { name: "Student Activities Center", abbreviation: "SAC", aliases: [], lat: 34.0715, lon: -118.4441 },
  { name: "Wooden Recreation and Sports Center", abbreviation: "WOODEN", aliases: ["John Wooden Center", "Wooden Center", "Wooden"], lat: 34.0716, lon: -118.4454 },
  { name: "Pauley Pavilion", abbreviation: null, aliases: ["Edwin W. Pauley Pavilion"], lat: 34.0704, lon: -118.4468 },
  { name: "James West Alumni Center", abbreviation: "JWEST", aliases: ["West Alumni Center", "Alumni Center"], lat: 34.0702, lon: -118.4454 },

  // ------------------------------------------------------------- Anderson School
  { name: "Marion Anderson Hall", abbreviation: "ANDERSON", aliases: ["Anderson Hall", "UCLA Anderson School of Management"], lat: 34.0740, lon: -118.4430 },
  { name: "Cornell Hall", abbreviation: "CORNELL", aliases: [], lat: 34.0740, lon: -118.4434 },
  { name: "Gold Hall", abbreviation: "GOLD", aliases: [], lat: 34.0736, lon: -118.4439 },
  { name: "Entrepreneurs Hall", abbreviation: "ENTRPNR", aliases: [], lat: 34.0736, lon: -118.4434 },
  { name: "Collins Center for Executive Education", abbreviation: "COLLINS", aliases: ["Collins Executive Education Center"], lat: 34.0735, lon: -118.4445 },
  { name: "Korn Convocation Hall", abbreviation: "KORN", aliases: [], lat: 34.0736, lon: -118.4431 },
  { name: "Eugene and Maxine Rosenfeld Library", abbreviation: "ROSNFLD", aliases: ["Rosenfeld Library"], lat: 34.0744, lon: -118.4435 },

  // ------------------------------------------------------------------- The Hill
  { name: "Carnesale Commons", abbreviation: "CARNESL", aliases: ["Carnesale"], lat: 34.0718, lon: -118.4498 },
  { name: "Covel Commons", abbreviation: "COVEL", aliases: ["Covel"], lat: 34.0730, lon: -118.4500 },
  { name: "De Neve Plaza Commons Building", abbreviation: "DE NEVE", aliases: ["De Neve Commons", "De Neve Plaza"], lat: 34.0704, lon: -118.4502 },
  { name: "Canyon Point", abbreviation: "CNYN PT", aliases: [], lat: 34.0737, lon: -118.4509 },
  { name: "Northwest Campus Auditorium", abbreviation: "NWAUD", aliases: [], lat: 34.0719, lon: -118.4504 },
  { name: "Sproul Hall", abbreviation: "SPROUL", aliases: [], lat: 34.0721, lon: -118.4500 },
  { name: "Rieber Hall", abbreviation: "RIEBER", aliases: [], lat: 34.0720, lon: -118.4515 },
  { name: "Dykstra Hall", abbreviation: "DYKSTRA", aliases: [], lat: 34.0700, lon: -118.4501 },
  { name: "Hedrick Hall", abbreviation: "HEDRICK", aliases: [], lat: 34.0733, lon: -118.4524 },
  { name: "Olympic Hall", abbreviation: "OLYMPIC", aliases: [], lat: 34.0724, lon: -118.4536 },
  { name: "Bradley Hall", abbreviation: "BRADLEY", aliases: ["Bradley International Hall"], lat: 34.0696, lon: -118.4494 },

  // --------------------------------------------------------------------- Other
  { name: "Fernald Center", abbreviation: "FERNALD", aliases: [], lat: 34.0764, lon: -118.4438 },
  { name: "UCLA Lab School, Seeds Campus", abbreviation: "UES", aliases: ["UCLA Lab School", "Seeds Campus"], lat: 34.0755, lon: -118.4437 },
  { name: "Lab School 1", abbreviation: "LABSCH1", aliases: [], lat: 34.0755, lon: -118.4437 },
  { name: "William Andrews Clark Memorial Library", abbreviation: "CLARK", aliases: ["Clark Library"], lat: 34.0287, lon: -118.3097 },
];

/** Location strings that are not a place you can walk to. */
const VIRTUAL_LOCATION_RE =
  /^(online|no location|no facility|off campus|to be (announced|arranged)|tba|tbd|n a|field|remote|see instructor)\b/;

/** Lowercase, drop punctuation, collapse whitespace: "Boelter Hall 3400" -> "boelter hall 3400". */
export function normalizeLocation(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isVirtualLocation(input: string): boolean {
  return VIRTUAL_LOCATION_RE.test(normalizeLocation(input));
}

/** All (alias -> building) keys, longest first so "Engineering VI" beats "Engineering V". */
const BUILDING_KEYS: { key: string; building: Building }[] = BUILDINGS.flatMap((building) =>
  [building.name, building.abbreviation ?? "", ...building.aliases]
    .filter((k) => k.length > 0)
    .map((k) => ({ key: normalizeLocation(k), building }))
).sort((a, b) => b.key.length - a.key.length);

export interface LocationMatch {
  input: string;
  building: Building;
  room: string | null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull the room off the original string so its casing survives ("A65", "CS50"). */
function roomAfter(input: string, key: string): string | null {
  const pattern = key.split(" ").map(escapeRegExp).join("[^a-z0-9]+");
  const m = input.match(new RegExp(`^[^a-z0-9]*${pattern}[^a-z0-9]*(.*)$`, "i"));
  const room = m ? m[1].trim() : "";
  return room.length > 0 ? room : null;
}

/**
 * Turn a raw SoC location string ("Boelter Hall 3400", "BOELTER", "boelter")
 * into a building plus the leftover room designation.
 */
export function matchBuilding(input: string): LocationMatch | null {
  const norm = normalizeLocation(input);
  if (norm.length === 0) return null;

  for (const { key, building } of BUILDING_KEYS) {
    if (norm === key) return { input, building, room: null };
    if (norm.startsWith(`${key} `)) {
      return { input, building, room: roomAfter(input, key) };
    }
  }
  // Some people write the room first ("3400 Boelter Hall"); accept the building
  // name anywhere in the string as a fallback.
  for (const { key, building } of BUILDING_KEYS) {
    if (norm.includes(` ${key} `) || norm.endsWith(` ${key}`)) {
      return { input, building, room: null };
    }
  }
  return null;
}

/** Words too generic to identify a building ("Hall" matches half the campus). */
const GENERIC_TOKENS = new Set([
  "hall",
  "building",
  "center",
  "centre",
  "commons",
  "school",
  "ucla",
  "the",
  "and",
  "of",
  "for",
]);

/** Closest building names for an unmatched input, best first (may be empty). */
export function suggestBuildings(input: string, limit = 6): string[] {
  const tokens = normalizeLocation(input)
    .split(" ")
    .filter((t) => t.length > 2 && !/^\d/.test(t) && !GENERIC_TOKENS.has(t));
  if (tokens.length === 0) return [];
  return BUILDINGS.map((building) => {
    const haystack = normalizeLocation(
      [building.name, building.abbreviation ?? "", ...building.aliases].join(" ")
    );
    let score = 0;
    for (const t of tokens) {
      if (haystack.includes(t)) score += t.length;
      // Cheap typo tolerance: "Boelder" should still suggest Boelter Hall.
      else if (t.length >= 4 && haystack.includes(t.slice(0, 4))) score += 2;
    }
    return { building, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.building.name);
}

function haversineMeters(a: Building, b: Building): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface WalkEstimate {
  straight_line_m: number;
  approx_distance_m: number;
  approx_walk_minutes: number;
}

/** Haversine distance x path factor, at a normal walking pace. */
export function estimateWalk(from: Building, to: Building): WalkEstimate {
  const straight = haversineMeters(from, to);
  const distance = straight * PATH_FACTOR;
  return {
    straight_line_m: Math.round(straight),
    approx_distance_m: Math.round(distance),
    approx_walk_minutes: Math.round((distance / WALK_SPEED_M_PER_MIN) * 10) / 10,
  };
}
