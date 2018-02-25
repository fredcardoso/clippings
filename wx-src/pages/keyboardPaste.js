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
      $(".deck > #paste-by-shortcut-key").fadeIn("fast");
    }
    else {
      $(".deck > #paste-by-shortcut-key").hide();
      chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, { height: WNDH_SEARCH_CLIPPING }, aWnd => {
        $(".deck > #search-by-name").fadeIn("fast");
        $("#clipping-search").focus();
      });
    }
  });

  // Fix for Fx57 bug where bundled page loaded using
  // browser.windows.create won't show contents unless resized.
  // See <https://bugzilla.mozilla.org/show_bug.cgi?id=1402110>
  browser.windows.getCurrent((win) => {
    browser.windows.update(win.id, {width:win.width+1})
  });
});


$(window).keypress(aEvent => {
  if (aEvent.key == "Escape") {
    if (gPasteMode == aeConst.PASTEACTION_SEARCH_CLIPPING
        && $("#eac-container-clipping-search > ul").css("display") != "none") {
      $("#eac-container-clipping-search > ul").hide();
      return;
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
  else {
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
  function sanitize(aStr)
  {
    const MAX_LEN = 64;
    let rv = "";
    let originalLen = aStr.length;

    rv = sanitizeHTML(aStr);
    rv = aStr.replace(/</g, "&lt;");
    rv = rv.replace(/>/g, "&gt;");
    rv = rv.substr(0, MAX_LEN);
    rv += (originalLen > rv.length ? " ..." : "");

    return rv;
  }
  
  let clippings = [];

  gClippingsDB.clippings.where("parentFolderID").notEqual(aeConst.DELETED_ITEMS_FLDR_ID).each((aItem, aCursor) => {
    clippings.push(
      sanitize(aItem.name)
      /**
      { id: aItem.id,
      name: sanitize(aItem.name),
      preview: sanitize(aItem.content) }
      **/
    );
  }).then(() => {
    // Initialize the autocomplete UI widget.
    $("#clipping-search").textext({
      plugins: "autocomplete",
      autocomplete: {
        dropdownMaxHeight: "128px",
        render: function (aSuggestion)
        {
          let menuItemStr = sanitizeHTML(`<div class="clipping"><div class="name">${aSuggestion}</div></div>`);
          return menuItemStr;
        }
      }
    }).bind("getSuggestions", function (aEvent, aData) {
      let query = (aData ? aData.query : '') || '';
      // TO DO: Make the search case insensitive always.
      // For now, only match if search string is lowercase.
      $(this).trigger("setSuggestions", {
        result: clippings.filter(aClippingName => aClippingName.toLowerCase().includes(query))
      });
    });
    /***
    let eacOpts = {
      data: clippings,
      getValue: "name",
      list: {
        maxNumberOfElements: 10000,
        match: {
          enabled: true
        },

        onLoadEvent: function () {
          let numMatches = $(".easy-autocomplete-container > ul > li").length;
          $("#num-matches").text(chrome.i18n.getMessage("numMatches", numMatches));
        },
        
        onShowListEvent: function () {
          $(".easy-autocomplete-container").removeAttr("hidden");
        },
        
        onHideListEvent: function () {
          $(".easy-autocomplete-container").attr("hidden", "true");
        },

        onChooseEvent: function () {
          let selectedItem = $("#clipping-search").getSelectedItemData();
          
          browser.runtime.sendMessage({
            msgID: "paste-clipping-by-name",
            clippingID: selectedItem.id
          });
          
          closeDlg();
        }
      },
      template: {
        type: "custom",
        method: function (aValue, aItem) {
          let menuItemStr = sanitizeHTML(`<div class="clipping"><div class="name">${aValue}</div><div class="preview">${aItem.preview}</div></div>`);
          return menuItemStr;
        }
      }
    };
  
    $("#clipping-search").easyAutocomplete(eacOpts);

    // EasyAutocomplete adds a <div class="easy-autocomplete"> and places the
    // clipping search textbox inside it.
    $(".easy-autocomplete").addClass("browser-style").css({ width: "100%" });
    ***/
    
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
      $("#clear-search").hide();
    });

    $("#clipping-search").focus();
    $("#clear-search").hide();
    /***
    $(".easy-autocomplete-container").attr("hidden", "true");
    ***/
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
