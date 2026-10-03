// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

/** The three looks Windows had between 98 and 7. */
export const enum ThemeFamily {
	/** 3D bevels on grey: 98, ME, 2000, and the "Windows Classic" scheme of XP, Vista and 7. */
	Classic = "classic",
	/** XP's rounded, gradient chrome. */
	Luna = "luna",
	/** Vista and 7: glass frames (Aero) or their opaque fallback (Basic). */
	Aero = "aero",
}

/** Every theme the toolkit draws. The value is also the CSS modifier (`win-theme--xp-blue`). */
export const enum WinTheme {
	Win98 = "win98",
	WinMe = "winme",
	Win2000 = "win2000",
	Classic = "classic",
	XpBlue = "xp-blue",
	XpOlive = "xp-olive",
	XpSilver = "xp-silver",
	XpRoyale = "xp-royale",
	VistaBasic = "vista-basic",
	VistaAero = "vista-aero",
	Win7Basic = "win7-basic",
	Win7Aero = "win7-aero",
}

export interface ThemeInfo {
	readonly Id: WinTheme;
	readonly Name: string;
	readonly Year: number;
	readonly Family: ThemeFamily;
	readonly ClassName: string;
}

const Theme = (Id: WinTheme, Name: string, Year: number, Family: ThemeFamily): ThemeInfo =>
	Object.freeze({ Id, Name, Year, Family, ClassName: `win-theme--${Id}` });

export const AllThemes: readonly ThemeInfo[] = Object.freeze([
	Theme(WinTheme.Win98, "Windows 98", 1998, ThemeFamily.Classic),
	Theme(WinTheme.WinMe, "Windows ME", 2000, ThemeFamily.Classic),
	Theme(WinTheme.Win2000, "Windows 2000", 2000, ThemeFamily.Classic),
	Theme(WinTheme.Classic, "Windows Classic (XP, Vista, 7)", 2001, ThemeFamily.Classic),
	Theme(WinTheme.XpBlue, "Windows XP (Blue)", 2001, ThemeFamily.Luna),
	Theme(WinTheme.XpOlive, "Windows XP (Olive Green)", 2001, ThemeFamily.Luna),
	Theme(WinTheme.XpSilver, "Windows XP (Silver)", 2001, ThemeFamily.Luna),
	Theme(WinTheme.XpRoyale, "Windows XP (Media Center Royale)", 2005, ThemeFamily.Luna),
	Theme(WinTheme.VistaBasic, "Windows Vista (Basic)", 2007, ThemeFamily.Aero),
	Theme(WinTheme.VistaAero, "Windows Vista (Aero)", 2007, ThemeFamily.Aero),
	Theme(WinTheme.Win7Basic, "Windows 7 (Basic)", 2009, ThemeFamily.Aero),
	Theme(WinTheme.Win7Aero, "Windows 7 (Aero)", 2009, ThemeFamily.Aero),
]);

const ById = new Map(AllThemes.map((theme) => [theme.Id, theme]));

export function GetTheme(id: WinTheme): ThemeInfo {
	return ById.get(id)!;
}
