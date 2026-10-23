// Indian locations as they appear in job-board location strings ("IND" is used by some boards).
// Matched as whole words, so "India" doesn't also match "Indiana" or "Indianapolis".
const INDIA_PLACES = [
  "india", "ind", "bengaluru", "bangalore", "hyderabad", "mumbai", "navi mumbai", "pune", "chennai",
  "gurgaon", "gurugram", "noida", "new delhi", "delhi", "ncr", "kolkata", "ahmedabad", "jaipur", "kochi",
  "cochin", "coimbatore", "chandigarh", "indore", "trivandrum", "thiruvananthapuram", "mysore", "mysuru",
  "vadodara", "nagpur", "bhubaneswar", "visakhapatnam", "lucknow", "mohali",
].join("|");

/** For JavaScript. */
export const INDIA_RE = new RegExp(`\\b(${INDIA_PLACES})\\b`, "i");

/** For Postgres `~*`, where \y (not \b) is the word boundary. */
export const INDIA_PATTERN = `\\y(${INDIA_PLACES})\\y`;

/** True when a preferred-location entry means "anywhere in India". */
export const isIndiaPreference = (pref: string) => /^\s*(india|anywhere in india|pan[- ]india)\s*$/i.test(pref);
