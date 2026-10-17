// Created by Anton Piruev in 2026.
// Any direct commercial use of derivative work is strictly prohibited.

import { describe, expect, it, vi } from "vitest";
import { Logger } from "../../../../Core/Source/Logging/Logger";
import type { CheckBoxController } from "../Source/Controls/CheckBoxController";
import type { LabelController } from "../Source/Controls/LabelController";
import type { WindowController } from "../Source/Controls/WindowController";
import { DialogResult } from "../Source/Documents/DialogResult";
import { ActionType, ChoiceCondition, GraphNodeKind, type GraphNode } from "../Source/Documents/Graph";
import { CreateNode, NewLayout, WidgetType } from "../Source/Documents/Layout";
import { UiDocument } from "../Source/Documents/UiDocument";

/** A form: the main window (the first top-level one) and a second, nested-in-the-form one. */
function Form(): UiDocument {
	const layout = NewLayout( "Form" );
	layout.Root.Children!.push( CreateNode( WidgetType.Window, "Main", 0, 0 ), CreateNode( WidgetType.Window, "Options", 0, 0 ) );
	return new UiDocument( layout );
}

describe( "windows of a UI document", () => {
	it( "closing the main window closes the document with Cancel; a canceled close keeps both open", () => {
		const document = Form();
		const veto = document.Events.On( "closing", ( event ) => event.Cancel() );
		expect( document.Controller<WindowController>( "Main" ).RequestClose() ).toBe( false );
		expect( document.Closed ).toBe( false );
		veto();
		expect( document.Controller<WindowController>( "Main" ).RequestClose() ).toBe( true );
		expect( [ document.Closed, document.Result ] ).toEqual( [ true, DialogResult.Cancel ] );
	} );

	it( "closing another window only hides it, reporting Cancel as its result; the document stays open", () => {
		const document = Form();
		const options = document.Controller<WindowController>( "Options" );
		const results: string[] = [];
		options.Events.On( "dialog-result", ( result ) => results.push( result ) );
		expect( options.RequestClose() ).toBe( false );
		expect( [ options.Visible, results, document.Closed ] ).toEqual( [ false, [ DialogResult.Cancel ], false ] );
		expect( document.CloseWindow( "Options", DialogResult.OK ) ).toBe( true );
		expect( results ).toEqual( [ DialogResult.Cancel, DialogResult.OK ] );
	} );

	it( "a window closed without a result is an error: nothing closes", () => {
		const error = vi.spyOn( Logger, "LogError" ).mockImplementation( () => undefined );
		const document = Form();
		expect( document.CloseWindow( "Main", undefined ) ).toBe( false );
		expect( document.Closed ).toBe( false );
		expect( error ).toHaveBeenCalledWith( "Error: Main closed with undefined dialog result" );
	} );
} );

describe( "node graphs and window results", () => {
	/** A form whose graph sets the label's text when `event` fires on `widget` with condition `when`. */
	function Wired( widget: string, event: string, when: string | undefined ): UiDocument {
		const layout = NewLayout( "Form" );
		layout.Root.Children!.push(
			CreateNode( WidgetType.Window, "Main", 0, 0 ),
			CreateNode( WidgetType.Window, "Options", 0, 0 ),
			CreateNode( WidgetType.Label, "Status", 0, 0 ),
			CreateNode( WidgetType.CheckBox, "Sound", 0, 0 ),
		);
		const trigger: GraphNode = { Id: "e", Kind: GraphNodeKind.Event, Type: event, X: 0, Y: 0, Params: { Widget: widget } };
		if ( when !== undefined ) {
			trigger.Params["When"] = when;
		}
		const action: GraphNode = { Id: "a", Kind: GraphNodeKind.Action, Type: ActionType.SetText, X: 0, Y: 0, Params: { Widget: "Status", Text: "ran" } };
		layout.Graph = { Nodes: [ trigger, action ], Links: [ { From: "e", To: "a" } ] };
		return new UiDocument( layout );
	}

	const ran = ( document: UiDocument ): boolean => document.Controller<LabelController>( "Status" ).Label === "ran";

	it( "a window's dialog-result node runs for the result it names", () => {
		const document = Wired( "Options", "dialog-result", DialogResult.OK );
		document.CloseWindow( "Options", DialogResult.Cancel );
		expect( ran( document ) ).toBe( false );
		document.CloseWindow( "Options", DialogResult.OK );
		expect( ran( document ) ).toBe( true );
	} );

	it.each( [ [ undefined ], [ "" ], [ "any" ] ] )( "a dialog-result node with the condition %j runs for any result", ( when ) => {
		const document = Wired( "Options", "dialog-result", when );
		document.CloseWindow( "Options", DialogResult.Cancel );
		expect( ran( document ) ).toBe( true );
	} );

	it( "an option condition on a widget without options (a check box) never passes", () => {
		const document = Wired( "Sound", "change", ChoiceCondition( 0 ) );
		document.Controller<CheckBoxController>( "Sound" ).Toggle();
		expect( ran( document ) ).toBe( false );
	} );
} );
