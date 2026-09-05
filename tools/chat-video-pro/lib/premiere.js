// Premiere Pro UXP API wrapper. Handles project item selection and timeline insertion.
//
// API notes: the `require("premierepro")` module exposes the typed PPro UXP API.
// Premiere is still evolving these APIs across versions — if your version differs,
// the two functions you'll likely need to tweak are:
//   - getSelectedProjectItem()
//   - insertClipsToActiveSequence()

window.CVP = window.CVP || {};

window.CVP.premiere = (function () {
  let ppro = null;
  try {
    ppro = require("premierepro");
  } catch (e) {
    // Not running inside Premiere — UI will still load, just disable timeline actions.
    console.warn("[CVP] Not running inside Premiere Pro:", e);
  }

  function isAvailable() {
    return ppro !== null;
  }

  async function getActiveProject() {
    if (!ppro) throw new Error("此功能僅在 Premiere Pro 內可用。");
    const project = await ppro.Project.getActiveProject();
    if (!project) throw new Error("沒有開啟的 Premiere 專案。");
    return project;
  }

  async function getActiveSequence() {
    const project = await getActiveProject();
    const seq = await project.getActiveSequence();
    if (!seq) throw new Error("沒有開啟的 Sequence。請先在 Premiere 開啟或新增一個 Sequence。");
    return { project, sequence: seq };
  }

  async function getSelectedProjectItem() {
    const project = await getActiveProject();
    const selection = await project.getSelection();
    if (!selection || selection.length === 0) {
      throw new Error("請先在 Premiere 的 Project Panel 點選一個影片素材。");
    }
    const item = selection[0];
    const name = await item.name;
    return { item, name };
  }

  function secondsToTickTime(seconds) {
    if (!ppro?.TickTime) throw new Error("ppro.TickTime 不可用。");
    return ppro.TickTime.createWithSeconds(seconds);
  }

  // Insert a list of clips (each with startSeconds/endSeconds referring to the source)
  // sequentially onto the active sequence's V1 / A1 tracks.
  async function insertClipsToActiveSequence({ projectItem, clips, onProgress }) {
    if (!ppro) throw new Error("此功能僅在 Premiere Pro 內可用。");
    const { project, sequence } = await getActiveSequence();

    const editor = ppro.SequenceEditor.getEditor(sequence);
    if (!editor) throw new Error("無法取得 SequenceEditor。");

    let cursorSeconds = 0;
    let inserted = 0;

    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      onProgress?.(i + 1, clips.length, clip);

      const inTime = secondsToTickTime(clip.startSeconds);
      const outTime = secondsToTickTime(clip.endSeconds);
      const placeAt = secondsToTickTime(cursorSeconds);

      // Each insert runs in its own transaction so a single failure doesn't roll everything back.
      await ppro.executeTransaction(
        (compoundAction) => {
          // Set the source's in/out, then insert at the cursor on V1/A1.
          // API method names can differ slightly by PPro version — adjust here if needed.
          const setInAction = projectItem.createSetInPointAction(inTime, ppro.Constants.MediaType.ANY);
          const setOutAction = projectItem.createSetOutPointAction(outTime, ppro.Constants.MediaType.ANY);
          compoundAction.addAction(setInAction);
          compoundAction.addAction(setOutAction);

          const insertAction = editor.createInsertProjectItemAction(
            projectItem,
            placeAt,
            0, // V1 (zero-indexed)
            0, // A1
            false // overwrite=false → ripple insert
          );
          compoundAction.addAction(insertAction);
        },
        `CVP insert clip ${i + 1}: ${clip.title}`
      );

      cursorSeconds += (clip.endSeconds - clip.startSeconds);
      inserted++;
    }

    return inserted;
  }

  return {
    isAvailable,
    getSelectedProjectItem,
    insertClipsToActiveSequence,
  };
})();
