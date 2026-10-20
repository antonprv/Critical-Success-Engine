// The code behind the main form (Content/UI/MainForm.ui.json): its widgets'
// events, its texts from the translation tables (Resources/*.cstables), the
// program's settings, the system's open dialog.

import { Form, SetProgramTheme, type ProgramTheme } from "@cse/program";
import type { ComboBoxController, TextBoxController } from "@cse/ui";
import { CSTables, CSTablesRuntime } from "./Generated/CSTables";

/** The looks the theme box offers. */
const Themes: { Label: string; Theme: ProgramTheme; }[] = [
	{ Label: "Quasar", Theme: { Kit: "quasar", Theme: "xp-blue" } },
	{
		Label: "Quasar (dark)",
		Theme: {
			Kit: "quasar",
			Theme: "xp-blue",
			Tailwind: {
				Accent: "blue",
				Neutral: "gray",
				Dark: true,
				Radius: "sm",
			},
		},
	},
	{
		Label: "Tailwind",
		Theme: {
			Kit: "tailwind",
			Theme: "xp-blue",
			Tailwind: {
				Accent: "indigo",
				Neutral: "zinc",
				Dark: false,
				Radius: "md",
			},
		},
	},
	{ Label: "Windows XP", Theme: { Kit: "classic", Theme: "xp-blue" } },
];

export class MainForm extends Form {
	public override OnConstruct(): void {
		const themes = this.Widget<ComboBoxController<number>>( "ThemeBox" );
		const languages =
			this.Widget<ComboBoxController<string>>( "LanguageBox" );

		themes.Options.splice(
			0,
			themes.Options.length,
			...Themes.map(
				( t, index ) => ( { Value: index, Label: t.Label } ),
			),
		);
		const theme = this.Settings.Get( "Program.Theme", 0 );

		themes.Choose( typeof theme === "number" ? theme : 0 );
		languages.Options.splice(
			0,
			languages.Options.length,
			...CSTablesRuntime.Languages.map(
				( code ) => ( { Value: code, Label: code } ),
			),
		);
		languages.Choose(
			CSTablesRuntime.Languages.indexOf( CSTablesRuntime.Language ),
		);
		this.On( "GreetButton", "click", () => this.Greet() );
		this.On( "ThemeBox", "change", ( index ) => {
			SetProgramTheme( Themes[index as number]!.Theme );
			this.Settings.Set( "Program.Theme", index as number );
		} );
		this.On( "LanguageBox", "change", ( code ) => {
			void CSTablesRuntime.SetLanguage( code as string ).then( () => {
				this.Settings.Set( "Program.Language", code as string );
				this.ShowTexts();
			} );
		} );
		this.On( "OpenButton", "click", () => void this.OpenFile() );
		this.ShowTexts();
	}

	/** Every text of the form in the current language. */
	private ShowTexts(): void {
		this.SetText(
			"TitleLabel",
			CSTables.UiNames.Title( { name: "TemplateProject" } ),
		);
		this.SetText( "NameLabel", CSTables.UiNames.NameLabel );
		this.SetText( "GreetButton", CSTables.UiNames.Greet );
		this.SetText( "ThemeLabel", CSTables.UiNames.Theme );
		this.SetText( "LanguageLabel", CSTables.UiNames.Language );
		this.SetText( "OpenButton", CSTables.UiNames.Open );
	}

	private Greet(): void {
		const name = this.Widget<TextBoxController>( "NameBox" ).Value.trim();

		this.SetText(
			"GreetingLabel",
			name === ""
				? CSTables.UiNames.NoName
				: CSTables.UiNames.Greeting( { name } ),
		);
	}

	private async OpenFile(): Promise<void> {
		const [file] = await this.Native.OpenDialog(
			{ Filters: [{ Name: "Text", Extensions: ["txt", "md", "json"] }] },
		);

		if ( file === undefined ) {
			this.SetText( "FileLabel", CSTables.UiNames.NoFile );
			return;
		}
		const text = await this.Native.ReadText( file );

		this.SetText(
			"FileLabel",
			CSTables.UiNames.Opened(
				text.split( "\n" ).length,
				{ path: file },
			),
		);
	}
}
