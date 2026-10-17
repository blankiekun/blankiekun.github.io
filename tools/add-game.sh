#!/usr/bin/env bash
# Adds a prebuilt CONscripter game to the Games store page (sites/games.html).
#   tools/add-game.sh <vndb.org/v… or thegamesdb.net/game.php?id=… link> <mega.nz link> [version, e.g. EN or JP]
#   tools/add-game.sh --remove <same vndb/tgdb link> [version]
# Each version gets its own Download button; adding a version again replaces its link.
# Removing without a version, or removing a game's last version, takes the game off the page.
# The title, cover and blurb come from VNDB or TheGamesDB. The site is public, so the
# Mega link must not carry its key: use a password-protected link (mega.nz/#P!…, made
# with the one friends' password) or a link exported without its key.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=sites/games.json

[[ $# -eq 2 || $# -eq 3 ]] || { sed -n '3,4p' "$0" | sed 's/^# *//' >&2; exit 2; }
[[ -f $DB ]] || echo '[]' > "$DB"

if [[ $1 == --remove ]]; then
  src=$2 ver=${3-}
  jq -e --arg src "$src" --arg ver "$ver" 'any(.src == $src and ($ver == "" or (.links | has($ver))))' "$DB" >/dev/null ||
    { echo "not on the page: $src${ver:+ ($ver)}" >&2; exit 1; }
  tmp=$(mktemp)
  jq --arg src "$src" --arg ver "$ver" \
    'map(if .src == $src and $ver != "" then .links |= del(.[$ver]) else . end
         | select(.src != $src or ($ver != "" and (.links | length) > 0)))' "$DB" > "$tmp"
  mv "$tmp" "$DB"
  echo "removed: $src${ver:+ ($ver)}"
  exit
fi

src=$1 mega=$2 ver=${3:-}
[[ $mega =~ ^https://mega\.nz/(#P!|(file|folder)/[^#]+$) ]] ||
  { echo "need a password-protected mega.nz/#P!… link, or one without its #key: $mega" >&2; exit 1; }

unent() { sed 's/&amp;/\&/g; s/&#0*39;/'"'"'/g; s/&quot;/"/g; s/&lt;/</g; s/&gt;/>/g'; }

if [[ $src =~ vndb\.org/(v[0-9]+) ]]; then
  game=$(curl -fsS https://api.vndb.org/kana/vn -H 'Content-Type: application/json' \
    -d '{"filters":["id","=","'"${BASH_REMATCH[1]}"'"],"fields":"title,alttitle,released,image.url,image.sexual,developers.name,platforms,description"}' |
    jq '.results[0] // error("not on VNDB") | {
      title, alt: .alttitle, released, by: ([.developers[].name] | join(", ")),
      platform: (.platforms | join(", ")),
      img: (if (.image.sexual // 2) < 1 then .image.url else null end),
      blurb: ((.description // "") | gsub("\\[[^]]*\\]"; ""))
    }')
elif [[ $src =~ thegamesdb\.net/game\.php\?id=([0-9]+) ]]; then
  html=$(curl -fsS "https://thegamesdb.net/game.php?id=${BASH_REMATCH[1]}")
  og() { sed -n 's/.*property="og:'"$1"'" content="\([^"]*\)".*/\1/p' <<<"$html" | head -1 | unent | unent; }
  field() { grep -m1 "$1" <<<"$html" | sed 's/<[^>]*>//g; s/.*'"$1"'//; s/[[:space:]]\+/ /g; s/^ //; s/ $//; s/ | /, /g' | unent; }
  game=$(jq -n --arg title "$(og title)" --arg img "$(og image)" --arg blurb "$(og description)" \
    --arg released "$(field 'ReleaseDate:')" --arg by "$(field 'Developer(s):')" --arg platform "$(field 'Platform:')" \
    '{title: $title, alt: null, released: $released, by: $by, platform: $platform, img: $img, blurb: $blurb}')
  [[ $(jq -r .title <<<"$game") ]] || { echo "not on TheGamesDB" >&2; exit 1; }
else
  echo "need a vndb.org/v… or thegamesdb.net/game.php?id=… link: $src" >&2; exit 1
fi

tmp=$(mktemp)
jq --argjson g "$game" --arg src "$src" --arg ver "$ver" --arg link "$mega" --arg added "$(date +%F)" \
  '(map(select(.src == $src))[0].links // {}) as $old
   | [.[] | select(.src != $src)] + [$g + {src: $src, links: ($old + {($ver): $link}), added: $added}]' "$DB" > "$tmp"
mv "$tmp" "$DB"
echo "added: $(jq -r .title <<<"$game")${ver:+ ($ver)}"
