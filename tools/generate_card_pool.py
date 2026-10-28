#!/usr/bin/env python3
"""Generate cards-pool.js, WildFlip's built-in card pool.

Run from the repo root:  python3 tools/generate_card_pool.py

Each rarity is every combination of four side numbers (left, top, right,
bottom) allowed by its rule. Cards are numbered from weakest to strongest by
the total of their sides (ties in left-top-right-bottom order), commons first,
then rares, then epics, and given animals ranked from weakest to strongest to
match.

A card's id comes from its rarity and sides (e.g. "rare-4-1-1-1"), so animals
and names can be reshuffled here without changing which cards players own.
"""
from itertools import product
from pathlib import Path

# Every animal, weakest to strongest. Dragons, unicorns, dinosaurs, the mammoth
# and the dodo are left out on purpose: they're kept for legendary cards.
ANIMALS = [
    ("Worm", "🪱"), ("Ant", "🐜"), ("Fly", "🪰"), ("Mosquito", "🦟"), ("Ladybug", "🐞"),
    ("Caterpillar", "🐛"), ("Snail", "🐌"), ("Cricket", "🦗"), ("Cockroach", "🪳"), ("Beetle", "🪲"),
    ("Butterfly", "🦋"), ("Bee", "🐝"), ("Oyster", "🦪"), ("Shrimp", "🦐"), ("Spider", "🕷️"),
    ("Chick", "🐤"), ("Mouse", "🐭"), ("Hamster", "🐹"), ("Sparrow", "🐦"), ("Fish", "🐟"),
    ("Chipmunk", "🐿️"), ("Rat", "🐀"), ("Frog", "🐸"), ("Lizard", "🦎"), ("Reef Fish", "🐠"),
    ("Scorpion", "🦂"), ("Crab", "🦀"), ("Dove", "🕊️"), ("Duck", "🦆"), ("Hedgehog", "🦔"),
    ("Bat", "🦇"), ("Pufferfish", "🐡"), ("Rabbit", "🐰"), ("Chicken", "🐔"), ("Squid", "🦑"),
    ("Parrot", "🦜"), ("Cat", "🐱"), ("Poodle", "🐩"), ("Rooster", "🐓"), ("Turkey", "🦃"),
    ("Sloth", "🦥"), ("Peacock", "🦚"), ("Penguin", "🐧"), ("Skunk", "🦨"), ("Swan", "🦢"),
    ("Flamingo", "🦩"), ("Owl", "🦉"), ("Black Cat", "🐈‍⬛"), ("Otter", "🦦"), ("Beaver", "🦫"),
    ("Raccoon", "🦝"), ("Turtle", "🐢"), ("Koala", "🐨"), ("Dog", "🐶"), ("Snake", "🐍"),
    ("Lobster", "🦞"), ("Octopus", "🐙"), ("Seal", "🦭"), ("Sheep", "🐑"), ("Goat", "🐐"),
    ("Ram", "🐏"), ("Pig", "🐷"), ("Monkey", "🐵"), ("Badger", "🦡"), ("Fox", "🦊"),
    ("Panda", "🐼"), ("Llama", "🦙"), ("Dolphin", "🐬"), ("Kangaroo", "🦘"), ("Eagle", "🦅"),
    ("Deer", "🦌"), ("Camel", "🐪"), ("Zebra", "🦓"), ("Cow", "🐮"), ("Ox", "🐂"),
    ("Boar", "🐗"), ("Horse", "🐴"), ("Buffalo", "🐃"), ("Orangutan", "🦧"), ("Wolf", "🐺"),
    ("Leopard", "🐆"), ("Giraffe", "🦒"), ("Bison", "🦬"), ("Crocodile", "🐊"), ("Shark", "🦈"),
    ("Whale", "🐋"), ("Hippo", "🦛"), ("Gorilla", "🦍"), ("Bear", "🐻"), ("Polar Bear", "🐻‍❄️"),
    ("Rhino", "🦏"), ("Tiger", "🐯"), ("Lion", "🦁"), ("Elephant", "🐘"),
]

# Themed sets for the collection binder. Every animal belongs to exactly one
# set, and so do all of its cards (its common card and its rare and epic
# versions), so every set has cards of every rarity.
SETS = [
    ("bugs", "Bugs", "🐞", ["Worm", "Ant", "Fly", "Mosquito", "Ladybug", "Caterpillar", "Snail", "Cricket",
                          "Cockroach", "Beetle", "Butterfly", "Bee", "Spider", "Scorpion"]),
    ("ocean", "Ocean", "🌊", ["Oyster", "Shrimp", "Fish", "Reef Fish", "Crab", "Pufferfish", "Squid", "Lobster",
                            "Octopus", "Seal", "Dolphin", "Shark", "Whale"]),
    ("birds", "Birds", "🪶", ["Chick", "Sparrow", "Dove", "Duck", "Chicken", "Parrot", "Rooster", "Turkey",
                            "Peacock", "Penguin", "Swan", "Flamingo", "Owl", "Eagle"]),
    ("river", "River & Swamp", "🐸", ["Frog", "Lizard", "Turtle", "Snake", "Crocodile", "Otter", "Beaver", "Hippo"]),
    ("pets", "Pets", "🏠", ["Mouse", "Hamster", "Rat", "Rabbit", "Cat", "Black Cat", "Dog", "Poodle"]),
    ("farm", "Farm", "🚜", ["Sheep", "Goat", "Ram", "Pig", "Cow", "Ox", "Horse", "Llama", "Buffalo"]),
    ("forest", "Forest", "🌲", ["Chipmunk", "Hedgehog", "Bat", "Skunk", "Raccoon", "Badger", "Fox", "Deer",
                              "Wolf", "Boar", "Bear"]),
    ("wild", "Wild", "🌍", ["Sloth", "Koala", "Monkey", "Panda", "Kangaroo", "Camel", "Zebra", "Orangutan",
                          "Leopard", "Giraffe", "Bison", "Gorilla", "Polar Bear", "Rhino", "Tiger", "Lion",
                          "Elephant"]),
]
SET_OF = {animal: set_id for set_id, _, _, animals in SETS for animal in animals}

# Rare cards reuse animals, so each gets a title, weakest to strongest within
# that animal's cards ("Wild Wolf" ... "Royal Wolf").
RARE_TITLES = ["Wild", "Swift", "Shadow", "Golden", "Royal", "Ancient"]
# Epic versions likewise ("Mystic Wolf" ... "Cosmic Wolf").
EPIC_TITLES = ["Mystic", "Storm", "Crystal", "Titan", "Cosmic"]
NAME_LENGTH = 20  # the longest name a card can have (as in the Card Builder)

# Built-in card ids from before ids were based on sides, mapped to their
# sides, so cards players already own carry over.
LEGACY_IDS = {
    "dog": "1-2-3-2", "cat": "2-3-1-2", "sparrow": "3-1-1-2", "fish": "1-1-2-3",
    "mouse": "2-2-2-1", "ant": "1-1-1-1", "ladybug": "1-1-1-2", "snail": "1-1-2-1",
    "cricket": "1-2-1-1", "beetle": "2-1-1-1", "butterfly": "1-1-1-3", "bee": "1-1-2-2",
    "shrimp": "1-1-3-1", "spider": "1-2-1-2", "hamster": "1-2-2-1", "chipmunk": "1-3-1-1",
    "rat": "2-1-1-2", "scorpion": "2-1-2-1", "crab": "2-2-1-1", "frog": "3-1-1-1",
    "lizard": "1-1-3-2", "dove": "1-2-1-3", "duck": "1-2-2-2", "chicken": "1-2-3-1",
    "tropical-fish": "1-3-1-2", "pufferfish": "1-3-2-1", "hedgehog": "2-1-1-3", "bat": "2-1-2-2",
    "rabbit": "2-1-3-1", "squid": "2-2-1-2", "parrot": "2-3-1-1", "turkey": "3-1-2-1",
    "sloth": "3-2-1-1", "peacock": "1-1-3-3", "penguin": "1-2-2-3", "swan": "1-3-1-3",
    "flamingo": "1-3-2-2", "owl": "1-3-3-1", "skunk": "2-1-2-3", "otter": "2-1-3-2",
    "beaver": "2-2-1-3", "raccoon": "2-2-2-2", "turtle": "2-2-3-1", "koala": "2-3-2-1",
    "snake": "3-1-1-3", "lobster": "3-1-2-2", "octopus": "3-1-3-1", "seal": "3-2-1-2",
    "sheep": "3-2-2-1", "goat": "3-3-1-1", "pig": "1-2-3-3", "monkey": "1-3-2-3",
    "badger": "1-3-3-2", "fox": "2-1-3-3", "panda": "2-2-2-3", "llama": "2-2-3-2",
    "dolphin": "2-3-1-3", "kangaroo": "2-3-2-2", "eagle": "2-3-3-1", "deer": "3-1-2-3",
    "camel": "3-1-3-2", "zebra": "3-2-1-3", "cow": "3-2-2-2", "boar": "3-2-3-1",
    "horse": "3-3-1-2", "orangutan": "3-3-2-1", "wolf": "1-3-3-3", "leopard": "2-2-3-3",
    "giraffe": "2-3-2-3", "bison": "2-3-3-2", "crocodile": "3-1-3-3", "shark": "3-2-2-3",
    "whale": "3-2-3-2", "hippo": "3-3-1-3", "gorilla": "3-3-2-2", "bear": "3-3-3-1",
    "polar-bear": "2-3-3-3", "rhino": "3-2-3-3", "tiger": "3-3-2-3", "lion": "3-3-3-2",
    "elephant": "3-3-3-3",
}


def common_rule(sides):
    return max(sides) <= 3


def rare_rule(sides):
    # Must use a 4 or 5 (anything lower is a common card) and total 15 or less.
    return max(sides) >= 4 and sum(sides) <= 15


def epic_rule(sides):
    # Must use a 6 (higher than any rare's side) and total 16 to 20 (more than
    # any rare's total), so every epic outranks every rare on both counts.
    return 6 in sides and 16 <= sum(sides) <= 20


def strength_order(rule, top_value):
    combos = [c for c in product(range(1, top_value + 1), repeat=4) if rule(c)]
    return sorted(combos, key=lambda c: (sum(c), c))


def card_id(rarity, sides):
    return f"{rarity}-" + "-".join(map(str, sides))


def split_evenly(items, parts):
    """Split into `parts` consecutive groups; the last groups get any extras."""
    size, extra = divmod(len(items), parts)
    groups, start = [], 0
    for i in range(parts):
        n = size + (1 if i >= parts - extra else 0)
        groups.append(items[start:start + n])
        start += n
    return groups


def build():
    animals = [name for name, _ in ANIMALS]
    grouped = [animal for _, _, _, members in SETS for animal in members]
    assert sorted(grouped) == sorted(animals), "every animal must be in exactly one set"

    cards = []
    commons = strength_order(common_rule, 3)
    for sides, (name, icon) in zip(commons, ANIMALS):
        cards.append(("common", sides, name, icon, SET_OF[name]))

    rares = strength_order(rare_rule, 5)
    for group, (name, icon) in zip(split_evenly(rares, len(ANIMALS)), ANIMALS):
        assert len(group) <= len(RARE_TITLES)
        for title, sides in zip(RARE_TITLES, group):
            cards.append(("rare", sides, f"{title} {name}", icon, SET_OF[name]))

    epics = strength_order(epic_rule, 6)
    for group, (name, icon) in zip(split_evenly(epics, len(ANIMALS)), ANIMALS):
        assert 1 <= len(group) <= len(EPIC_TITLES)
        for title, sides in zip(EPIC_TITLES, group):
            cards.append(("epic", sides, f"{title} {name}", icon, SET_OF[name]))

    assert len(commons) == 81 and len(cards) == 81 + len(rares) + len(epics)
    assert len({c[2] for c in cards}) == len(cards), "names must be unique"
    assert all(len(c[2]) <= NAME_LENGTH for c in cards), "names must fit the Card Builder"
    for set_id, set_name, _, _ in SETS:
        for rarity in ("common", "rare", "epic"):
            assert any(c[4] == set_id and c[0] == rarity for c in cards), f"{set_name} needs a {rarity} card"
    return cards


def write(cards):
    lines = []
    for no, (rarity, (left, top, right, bottom), name, icon, set_id) in enumerate(cards, start=1):
        if no == 1 or rarity != cards[no - 2][0]:
            lines.append(f"  // {rarity.capitalize()}")
        lines.append(
            f'  {{ no: {no}, id: "{card_id(rarity, (left, top, right, bottom))}", name: "{name}", icon: "{icon}", '
            f'rarity: "{rarity}", set: "{set_id}", left: {left}, top: {top}, right: {right}, bottom: {bottom} }},'
        )
    set_lines = [f'  {{ id: "{set_id}", name: "{name}", icon: "{icon}" }},' for set_id, name, icon, _ in SETS]
    legacy = [f'"{old}": "{card_id("common", tuple(map(int, sides.split("-"))))}"' for old, sides in LEGACY_IDS.items()]
    legacy_lines = ["  " + ", ".join(legacy[i:i + 3]) + "," for i in range(0, len(legacy), 3)]

    out = f"""// WildFlip built-in card pool. GENERATED by tools/generate_card_pool.py;
// change that script and re-run it rather than editing this file by hand.
//
// Commons: every combination of 1-3 on the four sides ({sum(c[0] == "common" for c in cards)} cards).
// Rares: sides 1-5 using at least one 4 or 5, totalling 15 or less ({sum(c[0] == "rare" for c in cards)} cards).
// Epics: sides 1-6 using at least one 6, totalling 16 to 20 ({sum(c[0] == "epic" for c in cards)} cards).
// Numbered weakest to strongest by side total within each rarity, with
// animals picked to match. Cards built in the Card Builder, and edits to
// these, are merged on top by CardRules.buildPool (cards-rules.js).

// Themed sets shown on the collection page; each card's `set` is one of these.
const CARD_SETS = [
{chr(10).join(set_lines)}
];

const BUILT_IN_CARDS = [
{chr(10).join(lines)}
];

// Ids built-in cards had before ids were based on sides; owned cards, saved
// edits and exports using them are switched to the new ids on load.
const LEGACY_CARD_IDS = {{
{chr(10).join(legacy_lines)}
}};

// The server (Cloud Functions) loads this file as a Node module.
if (typeof module !== "undefined" && module.exports) module.exports = {{ CARD_SETS, BUILT_IN_CARDS, LEGACY_CARD_IDS }};
"""
    Path(__file__).resolve().parent.parent.joinpath("cards-pool.js").write_text(out, encoding="utf-8")
    return len(cards)


if __name__ == "__main__":
    print(f"Wrote {write(build())} cards to cards-pool.js")
