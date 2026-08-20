import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.collectors.notes import move_note, new_note, remove_folder, rename_folder, write_note


class NotesMoveTests(unittest.TestCase):
    def test_new_note_uses_filename_as_title_without_duplicate_heading(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            result = new_note({"notes_dir": str(root)}, "A clean title")

            self.assertTrue(result["ok"])
            self.assertEqual((root / result["rel"]).read_text(encoding="utf-8"), "")

    def test_move_preserves_content_and_updates_pin_path(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Quick Notes" / "Captured.md"
            source.parent.mkdir()
            original = "# Captured\n\n| One | Two |\n| --- | --- |\n| A | B |\n"
            source.write_text(original, encoding="utf-8")
            store = {"pinned_notes": ["Quick Notes/Captured.md"]}

            with patch("backend.collectors.notes.edit_store", side_effect=lambda mutate: mutate(store)):
                result = move_note({"notes_dir": str(root)}, "Quick Notes/Captured.md", "Projects/Control Center")

            self.assertTrue(result["ok"])
            self.assertEqual(result["rel"], "Projects/Control Center/Captured.md")
            self.assertFalse(source.exists())
            self.assertEqual((root / result["rel"]).read_text(encoding="utf-8"), original)
            self.assertEqual(store["pinned_notes"], [result["rel"]])
            late_save = write_note({"notes_dir": str(root)}, "Quick Notes/Captured.md", "stale")
            self.assertFalse(late_save["ok"])
            self.assertFalse(source.exists())

    def test_move_to_unfiled_and_reject_collision_or_traversal(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Folder" / "Note.md"
            source.parent.mkdir()
            source.write_text("unchanged", encoding="utf-8")
            (root / "Note.md").write_text("existing", encoding="utf-8")

            collision = move_note({"notes_dir": str(root)}, "Folder/Note.md", "")
            traversal = move_note({"notes_dir": str(root)}, "Folder/Note.md", "../Outside")

            self.assertFalse(collision["ok"])
            self.assertFalse(traversal["ok"])
            self.assertEqual(source.read_text(encoding="utf-8"), "unchanged")

    def test_remove_folder_preserves_notes_subfolders_and_attachments(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            folder = root / "Projects"
            (folder / "Child").mkdir(parents=True)
            (folder / "Direct.md").write_text("direct", encoding="utf-8")
            (folder / "Child" / "Nested.md").write_text("nested", encoding="utf-8")
            attachment = folder / "image.png"
            attachment.write_bytes(b"image")

            with patch("backend.collectors.notes.edit_store", side_effect=lambda mutate: mutate({"pinned_notes": []})):
                result = remove_folder({"notes_dir": str(root)}, "Projects", "Archive")

            self.assertTrue(result["ok"])
            self.assertEqual((root / "Archive" / "Direct.md").read_text(encoding="utf-8"), "direct")
            self.assertEqual((root / "Archive" / "Child" / "Nested.md").read_text(encoding="utf-8"), "nested")
            self.assertTrue(attachment.exists())

    def test_remove_folder_preflights_collisions(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "Source").mkdir()
            (root / "Target").mkdir()
            (root / "Source" / "Same.md").write_text("source", encoding="utf-8")
            (root / "Target" / "Same.md").write_text("target", encoding="utf-8")

            with patch("backend.collectors.notes.edit_store", side_effect=lambda mutate: mutate({"pinned_notes": []})):
                result = remove_folder({"notes_dir": str(root)}, "Source", "Target")

            self.assertFalse(result["ok"])
            self.assertTrue((root / "Source" / "Same.md").exists())

    def test_rename_folder_preserves_notes_and_other_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            source = root / "Old" / "Nested"
            source.mkdir(parents=True)
            (source / "Note.md").write_text("note", encoding="utf-8")
            (root / "Old" / "image.png").write_bytes(b"image")

            with patch("backend.collectors.notes.edit_store", side_effect=lambda mutate: mutate({"pinned_notes": []})):
                result = rename_folder({"notes_dir": str(root)}, "Old", "New")

            self.assertTrue(result["ok"])
            self.assertEqual(result["folder"], "New")
            self.assertEqual((root / "New" / "Nested" / "Note.md").read_text(encoding="utf-8"), "note")
            self.assertEqual((root / "New" / "image.png").read_bytes(), b"image")
            self.assertFalse((root / "Old").exists())


if __name__ == "__main__":
    unittest.main()
