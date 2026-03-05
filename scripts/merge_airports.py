import json
with open("data/airports_part_a.json") as f:
    pa = json.load(f)
with open("data/airports_part_b.json") as f:
    pb = json.load(f)
with open("data/airports_part_c.json") as f:
    pc = json.load(f)
merged = dict(list(pa.items()) + list(pb.items()) + list(pc.items()))
with open("data/airport_db_compact.json", "w") as f:
    json.dump(merged, f, separators=(",", ":"), ensure_ascii=True)
print("Merged", len(merged), "airports")
