# Beta Readiness

We have a number of requirements to implement to reach our goal of being ready for beta testing:

1. Remove access to the manual. The full manual should not be available. Only context-sensitive help should be provided,
   this should not link through to a full manual. No button or link should allow access at any point.
2. We need to perform a code security review. As a security specialist check the code for security flaws.
3. We need to ensure the tutorial is complete. Peter has provided a feedback document: [2026113-Response-to-tutorial-notes.pdf](2026113-Response-to-tutorial-notes.pdf)
4. We need an option to auto-wield weapons. See the section below.
5. Review font sizes in the combat window - a lot of the messages are too small compared to the main text size.

## Auto-Wield Weapons

We need an additional setting on the settings panel 'Auto Wield/Wear' which should be turned on by default.
When enabled if a player picks up or is passed a weapon that they can wield, or an artifact that they can wear, this 
should happen automatically. When turned off the current behaviour (the player must do this manually) should be 
maintained.

## Player Combat Display

For party members allocated to a combat slot, only show artifacts associated with the party member that contribute
bonus points for that combat. So for example, don't show treasure, unwielded weapons, unworn artifacts or weapons that
have no effect for that player class.
