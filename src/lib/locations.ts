// Indian locations as they appear in job-board location strings. Plain alternation (no \b)
// so the same pattern works in JavaScript and in Postgres `~*` queries.
export const INDIA_PATTERN =
  "india|bengaluru|bangalore|hyderabad|mumbai|navi mumbai|pune|chennai|gurgaon|gurugram|noida|new delhi|delhi|ncr|kolkata|ahmedabad|jaipur|kochi|cochin|coimbatore|chandigarh|indore|trivandrum|thiruvananthapuram|mysore|mysuru|vadodara|nagpur|bhubaneswar|visakhapatnam|lucknow|mohali";

export const INDIA_RE = new RegExp(INDIA_PATTERN, "i");

/** True when a preferred-location entry means "anywhere in India". */
export const isIndiaPreference = (pref: string) => /^\s*(india|anywhere in india|pan[- ]india)\s*$/i.test(pref);
