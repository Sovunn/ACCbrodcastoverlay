# ──────────────────────────────────────────────
#  ACC car model → class / manufacturer mapping
# ──────────────────────────────────────────────

CAR_MODELS: dict[int, dict] = {
    # ── GT3 ──────────────────────────────────
    0:  {"name": "Porsche 991 GT3 R",            "manufacturer": "Porsche",      "class": "GT3"},
    1:  {"name": "Mercedes AMG GT3",             "manufacturer": "Mercedes",     "class": "GT3"},
    2:  {"name": "Ferrari 488 GT3",              "manufacturer": "Ferrari",      "class": "GT3"},
    3:  {"name": "Audi R8 LMS",                  "manufacturer": "Audi",         "class": "GT3"},
    4:  {"name": "Lamborghini Huracán GT3",       "manufacturer": "Lamborghini",  "class": "GT3"},
    5:  {"name": "McLaren 650S GT3",             "manufacturer": "McLaren",      "class": "GT3"},
    6:  {"name": "Nissan GT-R GT3 2018",         "manufacturer": "Nissan",       "class": "GT3"},
    7:  {"name": "BMW M6 GT3",                   "manufacturer": "BMW",          "class": "GT3"},
    8:  {"name": "Bentley Continental GT3 2018", "manufacturer": "Bentley",      "class": "GT3"},
    9:  {"name": "Porsche 991.2 GT3 Cup",        "manufacturer": "Porsche",      "class": "CUP"},
    10: {"name": "Nissan GT-R GT3 2017",         "manufacturer": "Nissan",       "class": "GT3"},
    11: {"name": "Bentley Continental GT3 2016", "manufacturer": "Bentley",      "class": "GT3"},
    12: {"name": "AMR V12 Vantage GT3",          "manufacturer": "Aston Martin", "class": "GT3"},
    13: {"name": "Reiter Lamborghini G3",        "manufacturer": "Lamborghini",  "class": "GT3"},
    14: {"name": "Emil Frey Jaguar G3",          "manufacturer": "Jaguar",       "class": "GT3"},
    15: {"name": "Emil Frey Jaguar G3 (v2)",     "manufacturer": "Jaguar",       "class": "GT3"},
    16: {"name": "Lexus RC F GT3",               "manufacturer": "Lexus",        "class": "GT3"},
    17: {"name": "Lamborghini Huracán GT3 Evo",  "manufacturer": "Lamborghini",  "class": "GT3"},
    18: {"name": "Honda NSX GT3",                "manufacturer": "Honda",        "class": "GT3"},
    19: {"name": "Lamborghini Huracán ST",       "manufacturer": "Lamborghini",  "class": "ST"},
    20: {"name": "Audi R8 LMS Evo",             "manufacturer": "Audi",         "class": "GT3"},
    21: {"name": "AMR V8 Vantage GT3",           "manufacturer": "Aston Martin", "class": "GT3"},
    22: {"name": "Honda NSX GT3 Evo",            "manufacturer": "Honda",        "class": "GT3"},
    23: {"name": "McLaren 720S GT3",             "manufacturer": "McLaren",      "class": "GT3"},
    24: {"name": "Porsche 991 II GT3 R",         "manufacturer": "Porsche",      "class": "GT3"},
    25: {"name": "Ferrari 488 GT3 Evo",          "manufacturer": "Ferrari",      "class": "GT3"},
    26: {"name": "Mercedes AMG GT3 Evo",         "manufacturer": "Mercedes",     "class": "GT3"},
    27: {"name": "Ferrari 488 Challenge Evo",    "manufacturer": "Ferrari",      "class": "CUP"},
    28: {"name": "BMW M2 CS Racing",             "manufacturer": "BMW",          "class": "TCX"},
    29: {"name": "Porsche 992 GT3 Cup",          "manufacturer": "Porsche",      "class": "CUP"},
    30: {"name": "Lamborghini Huracán ST Evo2",  "manufacturer": "Lamborghini",  "class": "ST"},
    31: {"name": "BMW M4 GT3",                   "manufacturer": "BMW",          "class": "GT3"},
    32: {"name": "Audi R8 LMS GT3 Evo II",      "manufacturer": "Audi",         "class": "GT3"},
    33: {"name": "Ferrari 296 GT3",              "manufacturer": "Ferrari",      "class": "GT3"},
    34: {"name": "Lamborghini Huracán GT3 Evo2", "manufacturer": "Lamborghini",  "class": "GT3"},
    35: {"name": "Porsche 992 GT3 R",            "manufacturer": "Porsche",      "class": "GT3"},
    36: {"name": "McLaren 720S GT3 Evo",         "manufacturer": "McLaren",      "class": "GT3"},
    37: {"name": "Ford Mustang GT3",             "manufacturer": "Ford",         "class": "GT3"},
    # ── GT4 ──────────────────────────────────
    50: {"name": "Alpine A110 GT4",              "manufacturer": "Alpine",       "class": "GT4"},
    51: {"name": "AMR V8 Vantage GT4",           "manufacturer": "Aston Martin", "class": "GT4"},
    52: {"name": "Audi R8 LMS GT4",             "manufacturer": "Audi",         "class": "GT4"},
    53: {"name": "BMW M4 GT4",                   "manufacturer": "BMW",          "class": "GT4"},
    55: {"name": "Chevrolet Camaro GT4R",        "manufacturer": "Chevrolet",    "class": "GT4"},
    56: {"name": "Ginetta G55 GT4",              "manufacturer": "Ginetta",      "class": "GT4"},
    57: {"name": "KTM X-BOW GT4",               "manufacturer": "KTM",          "class": "GT4"},
    58: {"name": "Maserati MC GT4",              "manufacturer": "Maserati",     "class": "GT4"},
    59: {"name": "McLaren 570S GT4",             "manufacturer": "McLaren",      "class": "GT4"},
    60: {"name": "Mercedes AMG GT4",             "manufacturer": "Mercedes",     "class": "GT4"},
    61: {"name": "Porsche 718 Cayman GT4",       "manufacturer": "Porsche",      "class": "GT4"},
    62: {"name": "Toyota GR Supra GT4",          "manufacturer": "Toyota",       "class": "GT4"},
}

# Short abbreviation shown in the overlay logo slot
MANUFACTURER_ABBR: dict[str, str] = {
    "Porsche":      "PORS",
    "Mercedes":     "MERC",
    "Ferrari":      "FERR",
    "Audi":         "AUDI",
    "Lamborghini":  "LAMB",
    "McLaren":      "MCL",
    "Nissan":       "NISS",
    "BMW":          "BMW",
    "Bentley":      "BENT",
    "Aston Martin": "AMR",
    "Jaguar":       "JAG",
    "Lexus":        "LEX",
    "Honda":        "HOND",
    "Alpine":       "ALP",
    "Chevrolet":    "CHEV",
    "Ginetta":      "GIN",
    "KTM":          "KTM",
    "Maserati":     "MAS",
    "Toyota":       "TOY",
    "Ford":         "FORD",
}

# Class display order
CLASS_ORDER = ["GT3", "GT4", "CUP", "ST", "TCX"]

# Class accent colours  (used by web overlay)
CLASS_COLORS: dict[str, str] = {
    "GT3": "#cc0000",
    "GT4": "#cc6600",
    "CUP": "#0055cc",
    "ST":  "#006600",
    "TCX": "#550099",
}


def get_car_info(model_type: int) -> dict:
    return CAR_MODELS.get(
        model_type,
        {"name": f"Car #{model_type}", "manufacturer": "Unknown", "class": "GT3"},
    )


def get_car_class(model_type: int) -> str:
    return get_car_info(model_type)["class"]


def get_manufacturer(model_type: int) -> str:
    return get_car_info(model_type)["manufacturer"]


def get_manufacturer_abbr(model_type: int) -> str:
    mfr = get_manufacturer(model_type)
    return MANUFACTURER_ABBR.get(mfr, mfr[:4].upper())
