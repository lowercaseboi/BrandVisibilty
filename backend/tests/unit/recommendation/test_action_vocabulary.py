from __future__ import annotations

from app.recommendation.action_vocabulary import ACTION_VOCABULARY, EFFORT_CONSTANTS, effort_for, is_valid_action


def test_valid_actions_accepted():
    for action in ACTION_VOCABULARY:
        assert is_valid_action(action)


def test_free_text_rejected():
    assert not is_valid_action("Do something creative")


def test_every_action_has_an_effort_constant():
    assert ACTION_VOCABULARY.keys() == EFFORT_CONSTANTS.keys()


def test_effort_for_known_action():
    assert effort_for("Submit to directory") == 1
    assert effort_for("Publish comparison page") == 3
    assert effort_for("Correct outdated description") == 5
