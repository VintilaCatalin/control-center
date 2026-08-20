import unittest
from unittest.mock import Mock, patch

from backend.collectors import games


class GameNewsTests(unittest.TestCase):
    def setUp(self):
        games._GAME_NEWS_CACHE.clear()
        games._STEAM_NEWS_CACHE.clear()

    def test_non_steam_news_keeps_publisher_and_reader_id(self):
        raw = [{
            "title": "A Game receives a useful update",
            "url": "https://example.com/update",
            "when": 1234,
            "thumb": "https://example.com/thumb.jpg",
            "blurb": "Details about the update.",
            "domain": "example.com",
            "source_label": "Example Gaming",
            "author": "Writer",
        }]
        with patch("backend.collectors.games._feed_items", return_value=raw) as fetch:
            result = games.fetch_game_news("A Game", "xbox", "xbox-a-game", count=2)

        self.assertTrue(result["ok"])
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["provider"], "Example Gaming")
        self.assertEqual(result["items"][0]["origin"], "web")
        self.assertRegex(result["items"][0]["id"], r"^[a-f0-9]{16}$")
        self.assertIn('%22A+Game%22', fetch.call_args.args[0])

    def test_non_english_and_unrelated_headlines_are_rejected(self):
        raw = [
            {"title": "Новости A Game сегодня", "url": "https://example.com/ru"},
            {"title": "Another title gets an update", "url": "https://example.com/other"},
            {"title": "A Game launches its new expansion", "url": "https://example.com/en"},
        ]
        with patch("backend.collectors.games._feed_items", return_value=raw):
            result = games.fetch_game_news("A Game", "xbox", "xbox-a-game", count=4)

        self.assertTrue(result["ok"])
        self.assertEqual([item["title"] for item in result["items"]], ["A Game launches its new expansion"])

    def test_steam_news_rejects_non_english_headlines(self):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {"appnews": {"newsitems": [
            {"title": "Новое обновление", "url": "https://steam.example/ru", "contents": "Russian"},
            {"title": "New update available", "url": "https://steam.example/en", "contents": "English"},
        ]}}
        with patch("backend.collectors.games.requests.get", return_value=response):
            result = games.fetch_steam_news("123", count=4)

        self.assertEqual([item["title"] for item in result["items"]], ["New update available"])


if __name__ == "__main__":
    unittest.main()
