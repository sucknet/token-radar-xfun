"""Take the three dashboard screenshots: the board, a protocol's detail view and a filtered view.

Uses system Playwright (already installed). Opens dashboard/out/dashboard/index.html (which reads
../data.js), sets a 1280x900 viewport, and writes screenshots/1-board.png, 2-detail.png,
3-filtered.png sized 1280x900 (long side 1440 max, short side 800 min).
"""
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
DASH = HERE / "out" / "dashboard"
SHOTS = HERE / "screenshots"
SHOTS.mkdir(exist_ok=True)

URL = f"file:///{DASH.as_posix()}/index.html"

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 900})
    page.goto(URL)
    page.wait_for_timeout(1200)  # let data.js + app.js render

    # 1 — the board, top of the table
    page.screenshot(path=str(SHOTS / "1-board.png"), full_page=False)
    print("1-board.png written")

    # 2 — a protocol's detail view: open the first row's drawer
    rows = page.locator("table.grid tbody tr.row")
    rows.first.click()
    page.wait_for_timeout(600)
    page.screenshot(path=str(SHOTS / "2-detail.png"), full_page=False)
    print("2-detail.png written")
    page.keyboard.press("Escape")
    page.wait_for_timeout(300)

    # 3 — a filtered view: type a query and show the narrowed board
    page.fill("#q", "staking")
    page.wait_for_timeout(600)
    page.screenshot(path=str(SHOTS / "3-filtered.png"), full_page=False)
    print("3-filtered.png written")

    browser.close()

for f in sorted(SHOTS.glob("*.png")):
    print(f.name, f"{f.stat().st_size/1024:.0f}KB")
