import json
with open("data/airports_part1.json") as f:
    p1 = json.load(f)
with open("data/airports_part2.json") as f:
    p2 = json.load(f)
merged = dict(list(p1.items()) + list(p2.items()))
with open("data/airport_db_compact.json", "w") as f:
    json.dump(merged, f, separators=(",", ":"), ensure_ascii=True)
print("Merged", len(merged), "airports")
