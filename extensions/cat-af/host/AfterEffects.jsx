/**
 * CAT AF - After Effects ExtendScript Host Engine (.jsx)
 * Safely executes generated JSX scripts, manages compositions, layers, lights, cameras and keyframes.
 */

var catAF = {
    /**
     * Get active composition status
     */
    getCompStatus: function() {
        if (!app.project) {
            return JSON.stringify({ hasProject: false, hasComp: false });
        }
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            return JSON.stringify({ 
                hasProject: true, 
                hasComp: false,
                projectName: app.project.file ? app.project.file.name : "Untitled Project" 
            });
        }

        return JSON.stringify({
            hasProject: true,
            hasComp: true,
            compName: comp.name,
            width: comp.width,
            height: comp.height,
            frameRate: comp.frameRate,
            duration: comp.duration,
            numLayers: comp.numLayers
        });
    },

    /**
     * Ensures an active composition is available. Creates one if none exists.
     */
    ensureActiveComp: function() {
        if (!app.project) {
            app.newProject();
        }
        var comp = app.project.activeItem;
        if (!comp || !(comp instanceof CompItem)) {
            comp = app.project.items.addComp("CAT AF AI Composition", 1920, 1080, 1.0, 10.0, 30.0);
            comp.openInViewer();
        }
        return comp;
    },

    /**
     * Safely executes generated JSX code inside a named Undo Group
     */
    executeScript: function(jsxCode) {
        if (!app.project) {
            app.newProject();
        }

        var activeComp = this.ensureActiveComp();
        var undoName = "CAT AF: AI Effect Execution";
        app.beginUndoGroup(undoName);

        try {
            // Provide helper shortcut variables inside evaluation scope
            var comp = activeComp;
            
            // Execute the script
            eval(jsxCode);

            app.endUndoGroup();

            return JSON.stringify({
                success: true,
                message: "Đã thực thi mã lệnh ExtendScript thành công trong After Effects!",
                compName: activeComp.name,
                totalLayers: activeComp.numLayers
            });
        } catch (err) {
            app.endUndoGroup();
            return JSON.stringify({
                success: false,
                error: "Lỗi thực thi script tại dòng " + (err.line || "?") + ": " + err.message
            });
        }
    }
};

