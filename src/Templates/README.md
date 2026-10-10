# Templates

Project templates, as in Unreal Engine: a new project is created from one of them (genre, boilerplate, sample game) by
the project tools and registered so the engine and the tools know it. Every template is also a project the engine can
build as it is: `CSE_PROJECT=../../Templates/CoinHunt pnpm dev` (from src/CSEngine/Core).

| Template | Genre | Game |
|---|---|---|
| Blank | Blank | a ball on a floor; a main menu UI document |
| FirstPerson | FirstPerson | a first-person character in a test room |
| CoinHunt | Collectathon | collect the coins before the clock runs out |
| ThirdPerson | ThirdPerson | a character seen from behind in an arena; a distance HUD |
| TopDown | TopDown | seen from above at a fixed angle; visit the pad in every corner |

`TemplateProject` stands for the new project's name, in file names and in text. The engine's own project, Games Sample
(src/CSEngine/Core/Samples), builds the templates' games together for development and tests.
