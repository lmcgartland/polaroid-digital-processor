## This is a work in progress

Create virtual environment
`python3 -m venv env`
Activate virtual env
`source env/bin/activate`


Install deps
M1 Mac
`arch -arm64 python3.9 -m pip install --no-cache --force-reinstall opencv-python`

### Usage
Use a flatbed scanner to scan Polaroids at 400dpi. Replace hardcoded path to file in script to your file.

Run script `python3.9 main.py`

Your individual images should appear in the /out directory

## Future

- Rewrite using OpenCV JS for deployment to browser and make tool more accessible.
- CLI interface
