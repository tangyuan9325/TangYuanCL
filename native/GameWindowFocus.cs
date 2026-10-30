using System;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Threading;
using System.Text;

// Isolated helper: bounded by the parent process, never changes cursor clipping,
// sends synthetic input, or leaves a game window permanently topmost.
class GameWindowFocus {
    delegate bool EnumProc(IntPtr hwnd, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc callback, IntPtr param);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr hwnd, StringBuilder name, int size);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr hwnd, uint command);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] static extern bool ShowWindowAsync(IntPtr hwnd, int command);
    [DllImport("user32.dll")] static extern bool AttachThreadInput(uint from, uint to, bool attach);
    [DllImport("kernel32.dll")] static extern uint GetCurrentThreadId();
    static int Main(string[] args) {
        int pid, timeout;
        if (args.Length != 2 || !int.TryParse(args[0], out pid) || pid <= 0 || !int.TryParse(args[1], out timeout)) return 2;
        try {
            using (Process game = Process.GetProcessById(pid)) {
                var clock = Stopwatch.StartNew();
                IntPtr previous = IntPtr.Zero;
                long stableSince = 0;
                while (clock.ElapsedMilliseconds < Math.Min(180000, Math.Max(1000, timeout))) {
                    if (game.HasExited) return 3;
                    IntPtr window = IntPtr.Zero;
                    EnumWindows(delegate(IntPtr h, IntPtr unused) {
                        uint owner;
                        GetWindowThreadProcessId(h, out owner);
                        if (owner == pid && IsWindowVisible(h) && GetWindow(h, 4) == IntPtr.Zero) {
                            var name = new StringBuilder(256);
                            GetClassName(h, name, name.Capacity);
                            // Ignore Java/AWT installer splash windows; modern MC uses GLFW,
                            // legacy Minecraft uses LWJGL. Never select another process.
                            if (name.ToString().IndexOf("GLFW", StringComparison.OrdinalIgnoreCase) >= 0 || name.ToString().IndexOf("LWJGL", StringComparison.OrdinalIgnoreCase) >= 0) {
                                window = h; return false;
                            }
                        }
                        return true;
                    }, IntPtr.Zero);
                    if (window != previous) { previous = window; stableSince = clock.ElapsedMilliseconds; }
                    if (window != IntPtr.Zero && clock.ElapsedMilliseconds - stableSince >= 600) {
                        if (IsIconic(window)) ShowWindowAsync(window, 9);
                        if (GetForegroundWindow() == window) return 0;
                        SetForegroundWindow(window);
                        if (GetForegroundWindow() == window) return 0;
                        uint ignored;
                        uint foregroundThread = GetWindowThreadProcessId(GetForegroundWindow(), out ignored);
                        uint thisThread = GetCurrentThreadId();
                        bool attached = foregroundThread != 0 && foregroundThread != thisThread && AttachThreadInput(thisThread, foregroundThread, true);
                        try { SetForegroundWindow(window); }
                        finally { if (attached) AttachThreadInput(thisThread, foregroundThread, false); }
                        Thread.Sleep(100);
                        // Do not steal focus repeatedly after the user's next action.
                        if (GetForegroundWindow() == window) return 0;
                        Console.Error.WriteLine("Windows declined foreground activation");
                        return 4;
                    }
                    Thread.Sleep(150);
                }
            }
        } catch (Exception error) { Console.Error.WriteLine(error.Message); return 3; }
        Console.Error.WriteLine("Timed out waiting for game window");
        return 5;
    }
}
