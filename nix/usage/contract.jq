# Het MIP-13-privacycontract zoals de server het leest; moet gelijk lopen met
# USAGE_FIELDS in web/src/core/usage.ts en de veldenlijst in docs/analytics.md.
def usage_version: 1;
def usage_features:
  ["pinFeel", "pinWind", "hover", "search", "geo", "fav", "pin", "play", "scrub", "history", "fresh", "about"];
def usage_dimensions: {
  range: ["3", "8", "24", "all", "none"],
  theme: ["light", "system", "dark"],
  coarse: ["true", "false"],
  width: ["<430", "<960", ">=960"],
  dur: ["<1", "1-5", "5-30", ">30"]
};

def pct($n; $of): if $of == 0 then null else ($n * 1000 / $of | round / 10) end;
