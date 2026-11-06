import unittest

from load import needs, worker

HOUSE = "POLYGON((1000 1000, 1100 1000, 1100 1100, 1000 1100, 1000 1000))"


def tile(numbers, buildings):
    import mapbox_vector_tile as mvt
    return mvt.encode([
        {"name": "building", "features": [
            {"geometry": wkt, "properties": {"render_height": h}} for wkt, h in buildings]},
        {"name": "housenumber", "features": [
            {"geometry": wkt, "properties": {"housenumber": n}} for wkt, n in numbers]},
    ], default_options={"y_coord_down": True})


def numbers(raw):
    import mapbox_vector_tile as mvt
    layer = mvt.decode(raw, default_options={"y_coord_down": True})["housenumber"]
    return {f["properties"]["housenumber"]: (f["geometry"]["coordinates"], f["properties"])
            for f in layer["features"]}


class HouseNumberHeights(unittest.TestCase):
    # 474 a number inside a house takes its height and stays where it is
    @needs("pmtiles", "mapbox_vector_tile", "shapely")
    def test_a_number_inside_a_house_takes_its_height(self):
        heights = worker("tiles/house-number-heights.py")
        raw, lifted = heights.rewrite(tile([("POINT(1050 1010)", "12")], [(HOUSE, 9)]), 14, 5600, 3)
        place, props = numbers(raw)["12"]
        self.assertEqual(lifted, 1)
        self.assertEqual(place, [1050, 1010])
        self.assertEqual(props["render_height"], 9)

    # 474 a number a step outside the wall is still that house's
    @needs("pmtiles", "mapbox_vector_tile", "shapely")
    def test_a_number_just_outside_the_wall_is_still_its_houses(self):
        heights = worker("tiles/house-number-heights.py")
        raw, lifted = heights.rewrite(tile([("POINT(1050 996)", "12")], [(HOUSE, 9)]), 14, 5600, 3)
        self.assertEqual(lifted, 1)
        self.assertEqual(numbers(raw)["12"][1]["render_height"], 9)

    # 474 a number far from any house gets no height
    @needs("pmtiles", "mapbox_vector_tile", "shapely")
    def test_a_number_in_the_open_gets_no_height(self):
        heights = worker("tiles/house-number-heights.py")
        raw, lifted = heights.rewrite(tile([("POINT(2000 2000)", "3")], [(HOUSE, 9)]), 14, 5600, 3)
        self.assertEqual(lifted, 0)
        self.assertNotIn("render_height", numbers(raw)["3"][1])

    # 474 of two houses side by side, a number takes the one it stands in
    @needs("pmtiles", "mapbox_vector_tile", "shapely")
    def test_a_number_takes_the_house_it_stands_in(self):
        heights = worker("tiles/house-number-heights.py")
        shed = "POLYGON((1100 1000, 1150 1000, 1150 1100, 1100 1100, 1100 1000))"
        raw, _ = heights.rewrite(tile([("POINT(1098 1050)", "5")], [(HOUSE, 9), (shed, 3)]), 14, 5600, 3)
        self.assertEqual(numbers(raw)["5"][1]["render_height"], 9)

    # 474 a tile without buildings comes back byte for byte
    @needs("pmtiles", "mapbox_vector_tile", "shapely")
    def test_a_tile_without_buildings_is_untouched(self):
        import mapbox_vector_tile as mvt
        heights = worker("tiles/house-number-heights.py")
        raw = mvt.encode([{"name": "housenumber", "features": [
            {"geometry": "POINT(5 5)", "properties": {"housenumber": "1"}}]}])
        self.assertIs(heights.rewrite(raw, 14, 5600, 3)[0], raw)


if __name__ == "__main__":
    unittest.main()
