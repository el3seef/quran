"""The grounds of the ayah videos (src/video/Studio.tsx): classical paintings, all public domain, of skies,
mists, dusks and moonlight, with no one in them. Each cut as its entry says (a frame, a signature, a
figure left out), made the site's size, with a small one for choosing it by.

    py scripts/build_video_paintings.py <folder of the downloaded originals>

Writes public/video/paint/<id>.webp and <id>-t.webp, and src/video/paintings.json.
"""
import json
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..")
OUT = os.path.join(ROOT, "public", "video", "paint")

# id: file, crop (fractions), title, artist, year, tone, source page
PAINTINGS = {
    "church-twilight": ("church-twilight.jpg", None, "Twilight in the Wilderness", "Frederic Edwin Church", "1860", "warm", "https://commons.wikimedia.org/wiki/File:Frederic_Edwin_Church_-_Twilight_in_the_Wilderness.jpg"),
    "friedrich-mist": ("friedrich-mist.jpg", None, "Morning Mist in the Mountains", "Caspar David Friedrich", "1808", "cool", "https://commons.wikimedia.org/wiki/File:Friedrich_-_Morning_mist_in_the_mountains.jpg"),
    "kuindzhi-red": ("kuindzhi-red.jpg", (0.015, 0.02, 0.985, 0.7), "Red Sunset on the Dnieper", "Arkhip Kuindzhi", "1905–08", "warm", "https://commons.wikimedia.org/wiki/File:Red_Sunset_on_the_Dnieper_MET_DT2557.jpg"),
    "turner-lake": ("turner-lake.jpg", (0.095, 0.085, 0.915, 0.895), "Sun Setting over a Lake", "J. M. W. Turner", "c. 1840", "warm", "https://commons.wikimedia.org/wiki/File:Horror_und_Delight-Turner-Sun_Setting_over_a_Lake_DSC2132.jpg"),
    "dahl-moon": ("dahl-moon.jpg", None, "Study of a Moonlit Sky", "Johan Christian Dahl", "1822", "night", "https://commons.wikimedia.org/wiki/File:Johan_Christian_Claussen_Dahl_-_En_sky_og_landskap_studie_av_m%C3%A5neskinn.jpg"),
    "dahl-sunbeams": ("dahl-sunbeams.jpg", (0.02, 0.13, 0.98, 0.97), "Cloud Study with Sunbeams", "Johan Christian Dahl", "1836", "storm", "https://commons.wikimedia.org/wiki/File:Johan_Christian_Dahl_-_Cloud_Study_with_Sunbeams_-_Google_Art_Project.jpg"),
    "constable-clouds": ("constable-clouds.jpg", None, "Cloud Study", "John Constable", "1821", "cool", "https://commons.wikimedia.org/wiki/File:John_Constable_-_Cloud_Study_-_Google_Art_Project_(2442698).jpg"),
    "lionel-clouds": ("lionel-clouds.jpg", None, "Cloud Study", "Lionel Constable", "c. 1850", "cool", "https://commons.wikimedia.org/wiki/File:Lionel_Constable_-_Cloud_Study_-_Google_Art_Project.jpg"),
    "lionel-storm": ("lionel-storm.jpg", (0.012, 0.02, 0.988, 0.935), "Cloud Study", "Lionel Bicknell Constable", "1850", "storm", "https://commons.wikimedia.org/wiki/File:Lionel_Bicknell_Constable_-_Cloud_Study_-_2007.8.60_-_Clark_Art_Institute.tiff"),
    "constable-sky": ("constable-sky.jpg", None, "Cloud Study", "John Constable", "1821", "cool", "https://commons.wikimedia.org/wiki/File:John_Constable_-_Cloud_Study_-_Google_Art_Project_(2427780).jpg"),
    "inness-sundown": ("inness-sundown.jpg", None, "Landscape at Sundown, the Close of Day", "George Inness", "c. 1890", "warm", "https://commons.wikimedia.org/wiki/File:George_Inness_-_Landscape_at_Sundown,_The_Close_of_Day.jpg"),
    "kuindzhi-moon": ("kuindzhi-moon.jpg", None, "Moonlit Night on the Dnieper", "Arkhip Kuindzhi", "1880", "night", "https://commons.wikimedia.org/wiki/File:Kuindzhi_Moonlit_night_on_the_Dnieper_1880_grm_x2.jpg"),
    "tryon-twilight": ("tryon-twilight.jpg", None, "Twilight", "Dwight William Tryon", "c. 1918", "dusk", "https://commons.wikimedia.org/wiki/File:Dwight_William_Tryon_-_Twilight_-_1951.34_-_Dallas_Museum_of_Art.jpg"),
    "tryon-spring": ("tryon-spring.jpg", (0.0, 0.045, 1.0, 0.965), "Twilight, Early Spring", "Dwight William Tryon", "1893", "cool", "https://commons.wikimedia.org/wiki/File:Twilight,_Early_Spring,_by_Dwight_William_Tryon,_1893,_oil_on_canvas_-_Freer_Gallery_of_Art_-_DSC04859.jpg"),
    "blakelock-moon": ("blakelock-moon.jpg", None, "Moonlight", "Ralph Albert Blakelock", "c. 1885–90", "warm", "https://commons.wikimedia.org/wiki/File:Ralph_Albert_Blakelock_-_Moonlight_(c._1885-1890).jpg"),
    "blakelock-river": ("blakelock-river.jpg", None, "Moonlight", "Ralph Albert Blakelock", "c. 1883–89", "night", "https://commons.wikimedia.org/wiki/File:Ralph_Albert_Blakelock_-_%27Moonlight%27,_c._1883-1889,_High_Museum.JPG"),
    "blakelock-wood": ("blakelock-wood.jpg", (0.012, 0.012, 0.988, 0.985), "Moonlight", "Ralph Albert Blakelock", "late 1880s", "night", "https://commons.wikimedia.org/wiki/File:Ralph_Albert_Blakelock_-_Moonlight_-_Google_Art_Project_(27466953).jpg"),
    "turner-norham": ("turner-norham.jpg", (0.0, 0.0, 1.0, 0.72), "Norham Castle, Sunrise", "J. M. W. Turner", "c. 1845", "warm", "https://commons.wikimedia.org/wiki/File:Joseph_Mallord_William_Turner_062.jpg"),
}


def main():
    raw = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    out = []
    for k, (f, crop, title, artist, year, tone, url) in PAINTINGS.items():
        im = Image.open(os.path.join(raw, f)).convert("RGB")
        if crop:
            w, h = im.size
            im = im.crop((round(crop[0] * w), round(crop[1] * h), round(crop[2] * w), round(crop[3] * h)))
        big = im.copy()
        big.thumbnail((2400, 2400), Image.LANCZOS)
        big.save(os.path.join(OUT, f"{k}.webp"), "WEBP", quality=68, method=6)
        t = im.copy()
        t.thumbnail((360, 360), Image.LANCZOS)
        t.save(os.path.join(OUT, f"{k}-t.webp"), "WEBP", quality=74, method=6)
        out.append({"id": k, "title": title, "artist": artist, "year": year, "tone": tone, "w": big.width, "h": big.height, "url": url})
        print(k, big.size, os.path.getsize(os.path.join(OUT, f"{k}.webp")) // 1024, "KB")
    with open(os.path.join(ROOT, "src", "video", "paintings.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1, ensure_ascii=False)
        fh.write("\n")


main()
