#!/usr/bin/env bash
# Adds a prebuilt CONscripter game to the Games store page (sites/games.html).
#   tools/add-game.sh <vndb.org/v… or thegamesdb.net/game.php?id=… link> <mega.nz link>
# The title, cover and blurb come from VNDB or TheGamesDB. The Mega link is stored
# encrypted with the friends' password (GAMES_PASS, or asked for), so only friends
# you've given it to can open it; the catalog itself is public.
set -euo pipefail
cd "$(dirname "$0")/.."
DB=sites/games.json

[[ $# -eq 2 ]] || { sed -n '3p' "$0" | sed 's/^# *//' >&2; exit 2; }
src=$1 mega=$2
[[ $mega == https://mega.nz/* ]] || { echo "not a mega.nz link: $mega" >&2; exit 1; }
[[ -f $DB ]] || echo '[]' > "$DB"

if [[ -z ${GAMES_PASS:-} ]]; then read -rsp 'Friends password: ' GAMES_PASS; echo; fi
export GAMES_PASS
# Same format the page decrypts with WebCrypto: OpenSSL "Salted__", PBKDF2-SHA256, AES-256-CBC.
enc() { printf %s "$1" | openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -salt -pass env:GAMES_PASS -base64 -A; }
dec() { printf '%s\n' "$1" | openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 -pass env:GAMES_PASS -base64 -A 2>/dev/null; }

# Every game must share one password, or friends would need several.
first=$(jq -r '.[0].link // empty' "$DB")
if [[ -n $first ]] && ! dec "$first" | grep -q '^https://mega\.nz/'; then
  echo "that isn't the password the other games use" >&2; exit 1
fi

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

link=$(enc "$mega")
[[ $(dec "$link") == "$mega" ]] || { echo "encryption round trip failed" >&2; exit 1; }

tmp=$(mktemp)
jq --argjson g "$game" --arg src "$src" --arg link "$link" --arg added "$(date +%F)" \
  '[.[] | select(.src != $src)] + [$g + {src: $src, link: $link, added: $added}]' "$DB" > "$tmp"
mv "$tmp" "$DB"
echo "added: $(jq -r .title <<<"$game")"
