// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { Project } from "virtual:cse/project";
import { ToFriendlyName } from "../Engine/Projects/ProjectDescriptor";

/**
 * The name of the project being run (its .cseproject Name, as words), shown in
 * the UI: Games Sample for the engine's own project.
 */
export const GameTitle = ToFriendlyName( Project.Name );

/** The engine's name, shown as the maker's mark. */
export const EngineName = "Critical Success Engine";
