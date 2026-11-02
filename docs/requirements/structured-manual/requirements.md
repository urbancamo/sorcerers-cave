# Structured Manual

We are going to remove access to the manual as a separate document, so we need to start providing the information
in the manual as contextual help in the User Interface.

We will start be recreating the manual as a structured file that will allow the user-interface to display
contextual help. To get a feel for how this will work, we'll start with the card descriptions. In the new 
user-interface we have a card view. This should include an additional section at the bottom that is an expandable
help div that will display information relevant to that card, where available in the manual.

Cards can be: area cards, hazard cards, creature cards, treasure cards. Not all card types will have sensible
additional information that can be displayed.

Plan this work then implement the structured manual before adding card context-sensitive help. You should plan
out the other areas of the user interface that would benefit from contextual sensitive help.
