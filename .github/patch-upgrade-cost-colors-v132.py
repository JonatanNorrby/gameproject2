from pathlib import Path

css = Path('styles/meta-upgrades.css')
text = css.read_text(encoding='utf-8')
old = """.meta-upgrade-rank__footer {
  margin-top: auto;
  padding-top: 10px;
  color: #718096;
  font-size: 8px;
  font-weight: 900;
  line-height: 1.35;
  letter-spacing: .035em;
  text-transform: uppercase;
}

.meta-upgrade-rank--affordable .meta-upgrade-rank__footer {
  color: #f0d77c;
}
"""
new = """.meta-upgrade-rank__footer {
  margin-top: auto;
  padding-top: 10px;
  color: #718096;
  font-size: 8px;
  font-weight: 900;
  line-height: 1.35;
  letter-spacing: .035em;
  text-transform: uppercase;
}

.meta-upgrade-rank--next .meta-upgrade-rank__footer {
  color: #ff667d;
  font-size: 12px;
  font-weight: 1000;
  line-height: 1.25;
  text-shadow: 0 0 10px rgba(255,102,125,.2);
}

.meta-upgrade-rank--affordable .meta-upgrade-rank__footer {
  color: #70dc8b;
  text-shadow: 0 0 10px rgba(112,220,139,.22);
}
"""
assert text.count(old) == 1, 'Expected current upgrade footer styles exactly once'
css.write_text(text.replace(old, new), encoding='utf-8')

main = Path('src/main.js')
text = main.read_text(encoding='utf-8')
assert text.count('const GAME_VERSION = 131;') == 1, 'Expected GAME_VERSION 131 exactly once'
main.write_text(text.replace('const GAME_VERSION = 131;', 'const GAME_VERSION = 132;'), encoding='utf-8')

index = Path('index.html')
text = index.read_text(encoding='utf-8')
markers = {
    'BUILD v131': 'BUILD v132',
    'id="version-text">v131<': 'id="version-text">v132<',
    'SYSTEM ONLINE • v131': 'SYSTEM ONLINE • v132',
}
for old_marker, new_marker in markers.items():
    assert text.count(old_marker) == 1, f'Expected version marker exactly once: {old_marker}'
    text = text.replace(old_marker, new_marker)
index.write_text(text, encoding='utf-8')
