"""Shared helpers for the validation scripts: run the website's stats.js from Python."""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))


def run_js(cases):
    """Run stats.js analyze() on a list of {"x", "y", "opts"} dicts, return its results."""
    payload = json.dumps([{"x": [float(v) for v in c["x"]], "y": [float(v) for v in c["y"]],
                           "opts": c.get("opts")} for c in cases])
    proc = subprocess.run(["node", os.path.join(HERE, "js_stats.mjs")], input=payload,
                          capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise RuntimeError("node failed:\n" + proc.stderr)
    return json.loads(proc.stdout)
