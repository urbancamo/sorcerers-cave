# Bug Report: 20261106-revealed-dead-ends-versus-explored-dead-ends.

### Game Code: *XGBC*

### DateTimeStamp: *20261106T1735*

### Scenario Description

General game play

### Scenario Saved As Code: *XGBC*

### Scenario Comments

n/a

### Expected Outcome

(Pretending to be a newbie), I wouldn't expect the game to give me an active navigation
arrow for a route that I can see goes nowhere, and I can't use.

### Pass/Fail: *????*

### Test Outcome

Game does (by virtue of glowing arrow) invite you go down what can clearly see
is a dead end.

### Tester Comments

I don't know what to think about this. On the one hand, from the imaginary point of view
of the party, you have not yet explored that route.
But as the human player of the game, I have what seems like an erroneous wibbling
arrow inviting me to explore a dead end.
Here game reality and player reality are clashing.

## Developer Comments

Test scenario:

1. from the Gateway moved North into a North South tunnel. Note that the East exit is a dead-end on this area.
2. move South back to the Gateway.
3. move East into a normal chamber.
4. move North into a normal chamber. The option to move West is available, even though this is a revealed dead end.

In this scenario we should remove the option to move West, as it is a revealed dead-end and would just waste a players
turn.

