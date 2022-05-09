(function () {

  function initFilePreview(containerEl) {
    const sitePrefix = containerEl.dataset.filePathPrefix;
    function setPath(path) {
      containerEl.innerHTML = '';
      const previewEl = containerEl.appendChild(document.createElement('div'));
      const linkEl = previewEl.appendChild(document.createElement('a'));

      linkEl.setAttribute('href', `${sitePrefix}${path}`)
      const pathParts = path.split('/');
      const filename = pathParts[pathParts.length - 1];
      linkEl.setAttribute('download', filename);
      linkEl.innerHTML = `Download<br />${filename}`;
    }
    return {
      setPath,
    }
  }

  function initFileBrowser() {
    const rootContainer = document.querySelector('[data-file-browser]');

    // File listing and preview

    const fileListContainer = document.querySelector('[data-file-list]');
    const previewContainer = document.querySelector('[data-file-preview]');

    if (!fileListContainer || !previewContainer) {
      throw new Error("Unable to obtain file list or preview container");
    }

    const allItemPaths = window[fileListContainer.dataset.fileList];

    if (!allItemPaths) {
      throw new Error("Unable to obtain item paths");
    }

    // This is unnecessarily involved, but may be useful
    // if we need an hierarchical structure to access items later.
    // const allItemPathsAsObject = allItemPaths.
    //   map(path => ({ [path]: true })).
    //   reduce((prev, curr) => ({ ...prev, ...curr }), {});
    // const allItemsAsHierarchy = unflattenObject(allItemPathsAsObject);
    // const topLevelItemPaths = Object.keys(allItemsAsHierarchy);

    let initialItemPaths, initiallySelectedItemPath;
    try {
      initialItemPaths = JSON.parse(window.localStorage.getItem('initial-items'));
      // Abort loading if previously stored item list somehow contains an item that no longer exists
      const missingItem = initialItemPaths.
        find(iip => allItemPaths.find(ip => ip === iip || ip.startsWith(`${iip}/`)) < 0);
      if (missingItem) {
        throw new Error(`Invalid initial items stored (${missingItem} does not exist)`);
      }
      // Or if selected item path is not found
      initiallySelectedItemPath = window.localStorage.getItem('selected-item');
      if (initiallySelectedItemPath && allItemPaths.indexOf(initiallySelectedItemPath) < 0) {
        throw new Error(`Invalid selected item stored (${initiallySelectedItemPath} does not exist)`);
      }
    } catch (e) {
      // If no item state to load, only top-level items initially
      initialItemPaths = allItemPaths.
        map(i => i.split('/')[0]).
        filter(function deduplicate(itemID, idx, self) {
          return idx === self.indexOf(itemID);
        });
      initiallySelectedItemPath = null;
      window.localStorage.removeItem('initial-items');
      window.localStorage.removeItem('selected-item');
      console.error("Error loading stored data, reverting to default", e);
    }

    const listing = window.createWindowedListing(
      initialItemPaths,
      fileListContainer,
      initiallySelectedItemPath,
      onSelectItem,
      getItemLabel,
      getSubpaths,
      isDirectory,
    );

    const filePreview = initFilePreview(previewContainer);

    async function onSelectItem(itemPath, itemEl) {
      listing.getVisibleElements().map(element => element.classList.remove('selected'));
      itemEl.classList.add('selected');
      window.localStorage.setItem('selected-item', itemPath);

      // If shown items are a result of search, do not update stored state
      if (!itemIDsPreSearch) {
        window.localStorage.setItem('initial-items', JSON.stringify(listing.getItemIDs()));
      }

      if (await isDirectory(itemPath)) {
      } else {
        filePreview.setPath(itemPath);
      }
    }

    async function getItemLabel(itemPath) {
      const el = document.createElement('span');
      if (await isDirectory(itemPath)) {
        el.classList.add('directory');
      } else {
        el.classList.add('file');
      }
      const parts = itemPath.split('/');
      el.textContent = parts[parts.length - 1];
      return el;
    }

    /** Returns true if there is at least one child item for given item ID. */
    async function isDirectory(itemPath) {
      if (allItemPaths.find(path => path.startsWith(`${itemPath}/`))) {
        return true;
      }
      return false;
    }

    /** Returns a list of immediate child IDs. */
    async function getSubpaths(itemPath) {
      const slashCount = (itemPath.match(/\//ig) || []).length;
      return allItemPaths.filter(path =>
        path.startsWith(`${itemPath}/`) &&
        ((path.match(/\//ig) || []).length === slashCount + 1));
    }


    // Search

    const search = rootContainer.querySelector('[data-file-search]');
    let itemIDsPreSearch = null;

    if (search) {

      // Try to load previous search, if any
      const initialSearchString = window.localStorage.getItem('search-string');
      if (initialSearchString) {
        search.value = initialSearchString;
        setTimeout(() => {
          handleSearch(initialSearchString);
        }, 1000);
      }

      function itemPathMatchesSearch(itemPath, searchString) {
        const pathParts = itemPath.split('/');
        return pathParts[pathParts.length - 1].toLowerCase().indexOf(searchString.toLowerCase()) >= 0;
      }

      function handleSearch(searchString) {
        localStorage.setItem('search-string', searchString);
        if (searchString.length >= 2) {
          if (!itemIDsPreSearch) {
            itemIDsPreSearch = listing.getItemIDs();
          }
          listing.updateItems(
            (() => allItemPaths.filter(i => itemPathMatchesSearch(i, searchString))),
            true);
        } else {
          if (itemIDsPreSearch) {
            listing.updateItems((() => itemIDsPreSearch), true);
            itemIDsPreSearch = null;
          }
        }
      }

      search.addEventListener('keyup', function _handleSearch(evt) {
        handleSearch(evt.currentTarget.value);
      });
    }
  }

  document.addEventListener('DOMContentLoaded', initFileBrowser);

  /**
   * Aggregates parts (mapped to slash-separated paths) into a nested object.
   * E.g. `{ /some/path: A, /foo: B, /some/other/path: C }`
   * gets turned into `{ foo: B, some: { path: A, other: { path: C } } }`.
   */
  function unflattenObject(parts) {
      const result = {};

      for (const partPath of Object.keys(parts)) {
        if (Object.prototype.hasOwnProperty.call(parts, partPath)) {

          const keys = partPath.match(/^\/+[^\/]*|[^\/]*\/+$|(?:\/{2,}|[^\/])+(?:\/+$)?/g);
          // Matches a standalone slash in a key
          //const keys = partPath.match(/^\.+[^.]*|[^.]*\.+$|(?:\.{2,}|[^.])+(?:\.+$)?/g);

          if (keys) {
            keys.reduce((accumulator, val, idx) => {
              return accumulator[val] || (
                (accumulator[val] = isNaN(Number(keys[idx + 1]))
                  ? (keys.length - 1 === idx
                    ? parts[partPath]
                    : {})
                  : [])
              );
            }, result);
          }
        }
      }

      return result;
    }
})();
