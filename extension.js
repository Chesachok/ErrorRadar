const vscode = require('vscode');

/*
Провайдер дерева диагностик Error Radar.
Отвечает за:
	1. Получение диагностик из VS Code.
	2. Группировку диагностик по файлам.
	3. Отображение файлов и сообщений в боковой панели.
	4. Обновление дерева при изменении диагностик.
*/
class DiagnosticsProvider {
    constructor() {
        // Создаём событие, с помощью которого сообщаем VS Code, что содержимое дерева нужно обновить.
        this._onDidChangeTreeData = new vscode.EventEmitter();

        // VS Code подписывается на это событие, чтобы узнавать об изменениях в дереве.
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    refresh() {
        this._onDidChangeTreeData.fire(undefined);
    }

	/*
	Преобразует обьект файла или диагностики в элемент интерфейса VS Code
		Параметр: element (Object) - Объект файла или диагностики
		Вывод: item (vscode.TreeItem) - Элемент древа.
	*/
    getTreeItem(element) {
        if (element.type === 'file') {
            const fileName = element.uri.path.split('/').pop();

            const item = new vscode.TreeItem(`${fileName} (${element.diagnostics.length})`, vscode.TreeItemCollapsibleState.Expanded);

            item.resourceUri = element.uri;

            return item;
        }

        const diagnostic = element.diagnostic;

        const item = new vscode.TreeItem(diagnostic.message, vscode.TreeItemCollapsibleState.None);

        item.description = `Строка ${diagnostic.range.start.line + 1}`;

        item.tooltip = diagnostic.message;

        switch (diagnostic.severity) {
            case vscode.DiagnosticSeverity.Error:
                item.iconPath = new vscode.ThemeIcon('error');
                break;

            case vscode.DiagnosticSeverity.Warning:
                item.iconPath = new vscode.ThemeIcon('warning');
                break;

            default:
                item.iconPath = new vscode.ThemeIcon('info');
                break;
        }

        item.command = {
            command: 'error-radar.openDiagnostic',
            title: 'Перейти к диагностике',
            arguments: [element]
        };

        return item;
    }

    /*
    Возвращает дочерние элементы дерева.
    Без element возвращает список файлов.
    Для файла возвращает его диагностики.
    Для диагностики возвращает пустой список.

    Параметр: element (Object|undefined) - Родительский элемент.
    Вывод: (Array<Object>) - Массив дочерних элементов.
     */
    getChildren(element) {
        if (element && element.type === 'file') {
            return element.diagnostics.map(diagnostic => ({
                type: 'diagnostic',
                uri: element.uri,
                diagnostic
            }));
        }

        if (element) {
            return [];
        }

        const files = [];

        for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {

            if (diagnostics.length === 0) {
                continue;
            }

            files.push({
                type: 'file',
                uri,
                diagnostics
            });
        }

        return files;
    }
}

function activate(context) {
    const provider = new DiagnosticsProvider();

    const treeView = vscode.window.createTreeView('errorRadar.diagnostics',
		{
            treeDataProvider: provider
        }
    );

    context.subscriptions.push(treeView, vscode.languages.onDidChangeDiagnostics(() => {
            provider.refresh();
        })
    );

    const openDiagnosticCommand = vscode.commands.registerCommand('error-radar.openDiagnostic', async (element) => {
            if (!element || element.type !== 'diagnostic' || !element.uri || !element.diagnostic) {
                return;
            }

            const uri = element.uri;
            const diagnostic = element.diagnostic;

            try {
                const document = await vscode.workspace.openTextDocument(uri);

                const editor = await vscode.window.showTextDocument(document);

                const position = diagnostic.range.start;

                editor.selection = new vscode.Selection(position, position);

                editor.revealRange(diagnostic.range, vscode.TextEditorRevealType.InCenter);
            } catch (error) {
                vscode.window.showErrorMessage(
                    `Error Radar: не удалось открыть файл. ${error.message}`
                );
            }
        }
    );

    context.subscriptions.push(openDiagnosticCommand);

    const disposable = vscode.commands.registerCommand('error-radar.checkDiagnostics', () => {
            const editor = vscode.window.activeTextEditor;

            if (!editor) {
                vscode.window.showInformationMessage('Error Radar: сначала открой файл.');
                return;
            }

            const diagnostics = vscode.languages.getDiagnostics(editor.document.uri);

            let errors = 0;
            let warnings = 0;
            let information = 0;

            for (const diagnostic of diagnostics) {
                switch (diagnostic.severity) {
                    case vscode.DiagnosticSeverity.Error:
                        errors++;
                        break;

                    case vscode.DiagnosticSeverity.Warning:
                        warnings++;
                        break;

                    case vscode.DiagnosticSeverity.Information:
                    case vscode.DiagnosticSeverity.Hint:
                        information++;
                        break;
                }
            }

            const fileName =
                editor.document.fileName.split(/[\\/]/).pop();

            vscode.window.showInformationMessage(`Error Radar — ${fileName}: ` +
                `${errors} ошибок, ${warnings} предупреждений, ` +
                `${information} информационных сообщений.`);
        }
    );

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
};