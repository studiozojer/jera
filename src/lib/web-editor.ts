// Browser adapter for the native-owned editor. These are imperative DOM operations,
// not updates to React props or state. Native TextInput uses setNativeProps instead.
export function replaceWebText(editor: HTMLTextAreaElement, text: string, caret: number) {
  editor.value = text;
  editor.setSelectionRange(caret, caret);
}
