/* -*- mode: javascript; tab-width: 8; indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


const WNDH_SHORTCUT_KEY = 164;
const WNDH_SEARCH_CLIPPING = 222;
const WNDH_SHORTCUT_LIST = 260;
const WNDW_SHORTCUT_LIST = 420;
const DLG_HEIGHT_ADJ_WINDOWS = 14;

let gClippings, gClippingsDB, gPasteMode;

let gAutocompleteMenu = {
  _SCRL_LENGTH: 36,
  _SCRL_START_IDX: 2,
  _MAX_VISIBLE_POPUP_ITEMS: 3,
  _POPUP_MAX_HEIGHT: 112,
  
  _textboxElt: null,
  _popupElt: null,
  _listboxElt: null,
  _srchData: null,
  _selectedIdx: -1,

  init(aClippingData)
  {
    this._srchData = aClippingData;
    this._textboxElt = $("#clipping-search");
    this._popupElt = $("#search-results-popup");
    this._listboxElt = $("#search-results-listbox");

    this._textboxElt.on("keydown", aEvent => {
      let searchText = aEvent.target.value;

      if (aEvent.key == "ArrowDown" || aEvent.key == "Down") {
        if (searchText == "") {
          log("No search text was entered.");
          return;
        }

        if (! this.isPopupShowing()) {
          this._popupElt.show();
          let popupHt = parseInt(this._popupElt.css("height"));
          if (popupHt == this._POPUP_MAX_HEIGHT) {
            $("#search-by-name .key-legend").hide();
          }
          aEvent.preventDefault();
          return;
        }

        aEvent.preventDefault();
        
        if (this._selectedIdx == -1) {
          let firstChild = this._listboxElt.children()[0];
          firstChild.setAttribute("selected", "true");
          this._selectedIdx = 0;
        }
        else if (this._selectedIdx == (this._listboxElt.children().length - 1)) {
          log("At the last item of the search results popup.");
          return;
        }
        else {
          this._selectedIdx++;
          this._clearSelection();
          
          let selectedItem = null;
          let popupMenuItems = this._listboxElt.children();
          
          for (let i = 0; i < popupMenuItems.length; i++) {
            if (i == this._selectedIdx) {
              selectedItem = popupMenuItems[i];
              selectedItem.setAttribute("selected", "true");
              break;
            }
          }

          if (this._selectedIdx > this._SCRL_START_IDX) {
            let scrolled = this._popupElt[0].scrollTop;
            this._popupElt[0].scrollTop = scrolled + this._SCRL_LENGTH;
          }
        }
      }
      else if (aEvent.key == "ArrowUp" || aEvent.key == "Up") {
        if (searchText == "") {
          log("No search text was entered.");
          return;
        }

        if (! this.isPopupShowing()) {
          return;
        }
        
        aEvent.preventDefault();

        if (this._selectedIdx == -1) {
          log("Nothing selected (???)");
          return;
        }
        else if (this._selectedIdx == 0) {
          log("At the first item of the search results popup.");
          return;
        }
        else {
          this._selectedIdx--;
          this._clearSelection();
          
          let selectedItem = null;
          let popupMenuItems = this._listboxElt.children();
          
          for (let i = 0; i < popupMenuItems.length; i++) {
            if (i == this._selectedIdx) {
              selectedItem = popupMenuItems[i];
              selectedItem.setAttribute("selected", "true");
              break;
            }
          }

          if (this._selectedIdx < (popupMenuItems.length - 1 - this._SCRL_START_IDX)) {
            let scrolled = this._popupElt[0].scrollTop;
            this._popupElt[0].scrollTop = scrolled - this._SCRL_LENGTH;
          }
        }
      }
      else if (aEvent.key == "Enter") {
        if (this._selectedIdx == -1) {
          log("Nothing selected");
          return;
        }
        
        let selectedItem = $('div.clipping[selected="true"]')[0];
        let clippingID = Number(selectedItem.dataset.clippingId);
        this._selectClipping(clippingID);
      }
    });

    this._textboxElt.on("input", aEvent => {
      if (this.isPopupShowing()) {
        this._popupElt[0].scrollTop = 0;
        this._listboxElt.empty();
        this._popupElt.hide();
        this._selectedIdx = -1;
        $("#search-by-name .key-legend").show();
      }
      
      let searchText = this._sanitizeRegExp(aEvent.target.value);
      let menuItemsData = [];
      let menuItemsDataIdx = 0;

      if (searchText == "") {
        $("#num-matches").text("");
        return;
      }

      for (let i = 0; i < this._srchData.length; i++) {
        let clipping = this._srchData[i];
        let re = new RegExp(searchText, "i");
        
        if (clipping.name.search(re) != -1) {
          menuItemsData.push({
            index: menuItemsDataIdx++,
            id: clipping.id,
            name: clipping.name,
            preview: clipping.preview
          });
        }
      }

      let numMatches = menuItemsData.length;
      $("#num-matches").text(chrome.i18n.getMessage("numMatches", numMatches));

      if (numMatches > 0) {
        // Populate the popup.
        let listbox = this._listboxElt[0];
        
        for (let item of menuItemsData) {
          let clippingDiv = document.createElement("div");
          let nameDiv = document.createElement("div");
          let previewDiv = document.createElement("div");
          
          clippingDiv.className = "clipping";
          clippingDiv.dataset.index = item.index;
          clippingDiv.dataset.clippingId = item.id;
          
          nameDiv.className = "name";
          nameDiv.appendChild(document.createTextNode(item.name));
          
          previewDiv.className = "preview";
          previewDiv.appendChild(document.createTextNode(item.preview));
          
          clippingDiv.appendChild(nameDiv);
          clippingDiv.appendChild(previewDiv);

          listbox.appendChild(clippingDiv);
        }

        // Set height of popup when there are 1, 2, or 3+ search results.
        if (numMatches < this._MAX_VISIBLE_POPUP_ITEMS) {
          let heightVal = (numMatches * this._SCRL_LENGTH) + 4;
          this._popupElt.css({ height: `${heightVal}px` });
          $("#search-by-name .key-legend").show();
        }
        else {
          this._popupElt.css({ height: `${this._POPUP_MAX_HEIGHT}px` });
          $("#search-by-name .key-legend").hide();
        }
        
        this._popupElt.show();
      }
    });
    
    this._listboxElt.on("mouseover", aEvent => {
      this._clearSelection();
      let selectedItem = aEvent.target.parentNode;
      if (selectedItem.className == "clipping") {
        selectedItem.setAttribute("selected", "true");
        this._selectedIdx = selectedItem.dataset.index;
      }
    });

    this._listboxElt.on("mouseup", aEvent => {
      let selectedItem = aEvent.target.parentNode;
      let clippingID = Number(selectedItem.dataset.clippingId);
      this._selectClipping(clippingID);
    });
  },

  isPopupShowing()
  {
    return this._popupElt.css("display") != "none";
  },

  hidePopup()
  {
    this._popupElt[0].scrollTop = 0;
    this._popupElt.hide();
    this._selectedIdx = -1;
    this._clearSelection();
    $("#search-by-name .key-legend").show();
  },
  
  _clearSelection()
  {
    let oldSelectedItem = $('div.clipping[selected="true"]');
    oldSelectedItem.removeAttr("selected");
  },
  
  _selectClipping(aClippingID)
  {
    this._popupElt.hide();

    browser.runtime.sendMessage({
      msgID: "paste-clipping-by-name",
      clippingID: aClippingID
    });

    closeDlg();
  },

  _sanitizeRegExp(aRegExpStr)
  {
    let rv = aRegExpStr.replace(/\\/g, "\\\\");
    rv = rv.replace(/\(/g, "\\(");
    rv = rv.replace(/\)/g, "\\)");
    rv = rv.replace(/\[/g, "\\[");
    rv = rv.replace(/\]/g, "\\]");
    rv = rv.replace(/\{/g, "\\{");
    rv = rv.replace(/\}/g, "\\}");
    rv = rv.replace(/\-/g, "\\-");
    rv = rv.replace(/\^/g, "\\^");
    rv = rv.replace(/\$/g, "\\$");
    rv = rv.replace(/\|/g, "\\|");
    rv = rv.replace(/\+/g, "\\+");
    rv = rv.replace(/\*/g, "\\*");
    rv = rv.replace(/\?/g, "\\?");
    
    return rv;
  }
};


// DOM utility
function sanitizeHTML(aHTMLStr)
{
  return DOMPurify.sanitize(aHTMLStr, { SAFE_FOR_JQUERY: true });
}


// Initialize dialog
$(document).ready(() => {
  gClippings = chrome.extension.getBackgroundPage();

  if (! gClippings) {
    throw new Error("Clippings/wx: clippingKey.js: Failed to retrieve parent browser window!");
  }

  gClippingsDB = gClippings.getClippingsDB();
  let extVer = chrome.runtime.getManifest().version;

  aeImportExport.setDatabase(gClippingsDB);

  aeImportExport.setL10nStrings({
    shctTitle: chrome.i18n.getMessage("expHTMLTitle"),
    hostAppInfo: chrome.i18n.getMessage("expHTMLHostAppInfo", [extVer, gClippings.getHostAppName()]),
    shctKeyInstrxns: chrome.i18n.getMessage("expHTMLShctKeyInstrxn"),
    shctKeyCustNote: chrome.i18n.getMessage("expHTMLShctKeyCustNote"),
    shctKeyColHdr: chrome.i18n.getMessage("expHTMLShctKeyCol"),
    clippingNameColHdr: chrome.i18n.getMessage("expHTMLClipNameCol"),
  });

  initAutocomplete();
  $("#btn-cancel").click(aEvent => { cancel(aEvent) });

  chrome.history.deleteUrl({ url: window.location.href });

  browser.storage.local.get().then(aPrefs => {
    gPasteMode = aPrefs.pastePromptAction;
    
    if (gPasteMode == aeConst.PASTEACTION_SHORTCUT_KEY) {
      $(".deck > #search-by-name").hide();
      $(".deck > #paste-by-shortcut-key").show();
    }
    else {
      $(".deck > #paste-by-shortcut-key").hide();
      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, { height: WNDH_SEARCH_CLIPPING }, aWnd => {
        $(".deck > #search-by-name").show();
        $("#clipping-search").focus();
      });
    }
  });

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  browser.windows.getCurrent(aWnd => {
    browser.windows.update(aWnd.id, {
      width: aWnd.width + 1,
      focused: true,
    });
  });
});


$(window).keydown(aEvent => {
  const isMacOS = gClippings.getOS() == "mac";

  function isAccelKeyPressed()
  {
    if (isMacOS) {
      return aEvent.metaKey;
    }
    return aEvent.ctrlKey;
  }

  function isTextboxFocused(aEvent)
  {
    return (aEvent.target.tagName == "INPUT" || aEvent.target.tagName == "TEXTAREA");
  }

  if (aEvent.key == "Escape") {
    if (gPasteMode == aeConst.PASTEACTION_SEARCH_CLIPPING) {
      if (gAutocompleteMenu.isPopupShowing()) {
        gAutocompleteMenu.hidePopup();
        return;
      }
      else {
        if ($("#clipping-search").val() != "") {
          $("#clipping-search").val("");
          return;
        }
      }
    }
    cancel(aEvent);
  }
  else if (aEvent.key == "Enter" && gPasteMode == aeConst.PASTEACTION_SHORTCUT_KEY) {
    cancel(aEvent);
  }
  else if (aEvent.key == "F1") {
    if (isShortcutListDisplayed()) {
      return;
    }

    if (gPasteMode == aeConst.PASTEACTION_SHORTCUT_KEY) {
      $(".deck > #paste-by-shortcut-key").hide();
      initShortcutList();
      return;
    }
  }
  else if (aEvent.key == "F12" && aeConst.DEBUG) {
    // Allow opening Developer Tools.
    return;
  }
  else if (aEvent.key == "Tab") {
    aEvent.preventDefault();

    if (isShortcutListDisplayed()) {
      return;
    }
    
    if (gPasteMode == aeConst.PASTEACTION_SHORTCUT_KEY) {
      gPasteMode = aeConst.PASTEACTION_SEARCH_CLIPPING;
      $(".deck > #paste-by-shortcut-key").hide();

      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, { height: WNDH_SEARCH_CLIPPING }, aWnd => {
        $(".deck > #search-by-name").fadeIn("fast");
        $("#clipping-search").focus();
      });
    }
    else if (gPasteMode == aeConst.PASTEACTION_SEARCH_CLIPPING) {
      gPasteMode = aeConst.PASTEACTION_SHORTCUT_KEY;
      $(".deck > #search-by-name").hide();

      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, { height: WNDH_SHORTCUT_KEY }, aWnd => {
        $(".deck > #paste-by-shortcut-key").fadeIn("fast");
      });
    }
  }
  else if (aEvent.key == "/" || aEvent.key == "'") {
    if (! isTextboxFocused(aEvent)) {
      aEvent.preventDefault();
    }
  }
  else if (aEvent.key == "F5") {
    // Suppress browser reload.
    aEvent.preventDefault();
  }
  else {
    // Ignore standard browser shortcut keys.
    let key = aEvent.key.toUpperCase();
    if (isAccelKeyPressed() && (key == "D" || key == "F" || key == "N" || key == "P"
                                || key == "R" || key == "S" || key == "U")) {
      aEvent.preventDefault();
    }

    if (isShortcutListDisplayed()) {
      return;
    }
    
    if (gPasteMode == aeConst.PASTEACTION_SHORTCUT_KEY) {
      execShortcut(aEvent.key);
    }
  }
});


function initAutocomplete()
{
  function sanitize(aStr, aMaxLength)
  {
    const DEFAULT_LENGTH = 64;
    let rv = "";
    let originalLen = aStr.length;
    let length = aMaxLength ? aMaxLength : DEFAULT_LENGTH;

    rv = sanitizeHTML(aStr);
    rv = rv.substr(0, length);
    rv += (originalLen > rv.length ? "..." : "");

    return rv;
  }
  
  let allClippings = [];

  gClippingsDB.clippings.where("parentFolderID").notEqual(aeConst.DELETED_ITEMS_FLDR_ID).each((aItem, aCursor) => {
    allClippings.push({
      id: aItem.id,
      name: sanitize(aItem.name, 56),
      preview: sanitize(aItem.content),
    });
  }).then(() => {
    // Initialize the autocomplete UI widget.
    gAutocompleteMenu.init(allClippings);

    $("#clipping-search").on("keyup", aEvent => {
      if (aEvent.target.value == "") {
        $("#num-matches").text("\u00a0");  // Non-breaking space.
        $("#clear-search").hide();
      }
      else {
        $("#clear-search").show();
      }
    })
    
    $("#clear-search").click(aEvent => {
      $("#clipping-search").val("").focus();
      $("#num-matches").text("\u00a0");
      
      if (gAutocompleteMenu.isPopupShowing()) {
        gAutocompleteMenu.hidePopup();
      }
      
      $("#clear-search").hide();
    });

    $("#clipping-search").focus();
    $("#clear-search").hide();
  });
}


function initShortcutList()
{
  $("#dlg-buttons").remove();

  $("#shortcut-list-toolbar > #paste-clipping").click(aEvent => {
    let clippingKey = $("#shortcut-list-content > table > tbody > tr.selected-row td:first-child").text();
    execShortcut(clippingKey);
  });

  $("#shortcut-list-toolbar > #export-shct-list").click(aEvent => {
    exportShortcutList();
  });

  $("#shortcut-list-toolbar > #close").click(aEvent => {
    closeDlg();
  });
  
  let updWndInfo = {
    width: WNDW_SHORTCUT_LIST,
    height: WNDH_SHORTCUT_LIST,
  };
  if (gClippings.getOS() == "win") {
    updWndInfo.height += DLG_HEIGHT_ADJ_WINDOWS;
  }
  
  chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, updWndInfo, aWnd => {
    aeImportExport.getShortcutKeyListHTML(false).then(aShctListHTML => {
      $("#shortcut-list-content").append(sanitizeHTML(aShctListHTML));

      let tblWidth = window.innerWidth;
      $("#shortcut-list-content > table > thead").css({ width: `${tblWidth}px` });
      $("#shortcut-list-content > table > tbody").css({ width: `${tblWidth}px` });

      $("#shortcut-list-content > table > tbody > tr").on("mouseup", aEvent => {
        $("#shortcut-list-content > table > tbody > tr").removeClass("selected-row");
        $(aEvent.target).parent().addClass("selected-row");

        if ($("#paste-clipping").attr("disabled")) {
          $("#paste-clipping").removeAttr("disabled");
        }
      }).on("dblclick", aEvent => {
        let clippingKey = $("#shortcut-list-content > table > tbody > tr.selected-row td:first-child").text();
        execShortcut(clippingKey);
      });

      $(".deck > #shortcut-list").fadeIn("fast");
    }).catch(aErr => {
      console.error("Clippings/wx::keyboardPaste.js: initShortcutList(): " + aErr);
    });
  });
}


function isShortcutListDisplayed()
{
  return ($("#shortcut-list").css("display") == "block");
}


function exportShortcutList()
{
  aeImportExport.getShortcutKeyListHTML(true).then(aHTMLData => {
    let blobData = new Blob([aHTMLData], { type: "text/html;charset=utf-8"});
    let downldOpts = {
      url: URL.createObjectURL(blobData),
      filename: aeConst.HTML_EXPORT_SHORTCUTS_FILENAME,
      saveAs: true,
    };
    return browser.downloads.download(downldOpts);

  }).then(aDownldItemID => {
    log("Successfully exported the shortcut list.");
  }).catch(aErr => {
    if (aErr.fileName == "undefined") {
      log("User cancel");
    }
    else {
      console.error(aErr);
      window.alert("Sorry, an error occurred while creating the export file.\n\nDetails:\n" + getErrStr(aErr));
    }
  });
}

function execShortcut(aShortcutKey)
{
  browser.runtime.sendMessage({
    msgID: "paste-shortcut-key",
    shortcutKey: aShortcutKey
  });

  closeDlg();
}


function cancel(aEvent)
{
  closeDlg();
}


function closeDlg()
{
  // Always remember last paste mode, even if user cancelled.
  browser.storage.local.set({
    pastePromptAction: gPasteMode
  }).then(() => {
    browser.runtime.sendMessage({ msgID: "close-keybd-paste-dlg" });
    chrome.windows.remove(chrome.windows.WINDOW_ID_CURRENT);
  });
}


function getErrStr(aErr)
{
  let rv = `${aErr.name}: ${aErr.message}`;

  if (aErr.fileName) {
    rv += "\nSource: " + aErr.fileName;
  }
  else {
    rv += "\nSource: unknown";
  }

  if (aErr.lineNumber) {
    rv += ":" + aErr.lineNumber;
  }

  return rv;
}


function log(aMessage)
{
  if (aeConst.DEBUG) { console.log(aMessage); }
}
