chrome.devtools.panels.create("MinTool", "", "devtools/panel.html");

chrome.devtools.panels.elements.createSidebarPane("Attributes", (sidebar) => {
  sidebar.setPage("devtools/attributes-sidebar.html");
});
