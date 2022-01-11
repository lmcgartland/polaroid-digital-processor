### This is a work in progress!
After scanning hundreds of Polaroids manually and doing lightweight post-processing in the photos app (rotation/crop/sharpening), I figured it was time to automate the process. This script is the first at utilizing OpenCV to automatically extract the Polaroids from a single scanned image file. If you have any issues, please open an issue on Github and I'll do my best to help resolve it. PRs are also welcome!

## Getting started
**Requirements: Python 3**

Create virtual environment
`python3 -m venv env`
Activate virtual env
`source env/bin/activate`

Install deps
`pip install -r requirements.txt`

Note on M1 Mac I was only able to get OpenCV installed using:
`arch -arm64 python3 -m pip install --no-cache --force-reinstall opencv-python`

### Usage
Use a flatbed scanner to scan Polaroids at 400dpi. Replace hardcoded path to file in script to your file.

Run script `python3 main.py`

Your individual images should appear in the `/out` directory

## Future

- Rewrite using OpenCV JS for deployment to browser and make tool more accessible.
- CLI interface
