# Engine Rules Validation

I'd like to do a deep-dive into the game engine to determine if there any remaining gaps or differences
between the rules encoded in the game engine and the rulebook.

Investigate how we would achieve this. We have the overnight test scenario runner that would allow us to
run a large number of games to check lots of different scenarios. Or, we could define a comprehensive
table of every possible game scenario that can occur and check them individually via a contrived
game engine setup. Use plan mode and your highest level of thinking. We need to release this game now
and must be sure there are no remaining game engine bugs.

I can see the report will contain a number of entries where the rules don't fully define the scenario, 
and they need a judgment call by Peter or myself to determine that the interpretation of the rules 
is correct.

I can also see that we may need to approach this task from two directions: examine the game engine
logic to determine scenarios, and examine the rulebook to determine scenarios.

Do an initial investigation into the feasibility of completing this task. I'm interested in how best
software engineering practices, game design theory, and other relevant disciplines can be called upon.