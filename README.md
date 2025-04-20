# STB Diff Viewer

## Overview
STB Diff Viewer is a web application designed to compare 3D models stored in STB and XML formats. It allows users to visualize differences and similarities between two models, providing a user-friendly interface for model comparison.

## Project Structure
```
stb-diff-viewer
├── modules
│   ├── main.js          # Main entry point for the application
│   ├── ui.js            # Handles user interface components
│   ├── viewer.js        # Responsible for rendering 3D models
│   ├── stbParser.js     # Parses STB and XML files
│   ├── comparator.js     # Compares two models
│   └── geometryUtils.js  # Utility functions for geometric calculations
├── index.html           # Main HTML document
├── style.css            # Styles for the web application
└── README.md            # Documentation for the project
```

## Setup Instructions
1. **Clone the Repository**
   ```bash
   git clone <repository-url>
   cd stb-diff-viewer
   ```

2. **Open the Project**
   Open `index.html` in a web browser to run the application.

3. **File Upload**
   Use the file input fields to upload two models in STB or XML format for comparison.

## Usage Guidelines
- Select the elements you wish to compare using the checkboxes.
- Use the "モデルを表示/比較" button to initiate the comparison.
- Adjust the story clipping using the dropdown and buttons provided.
- Toggle the legend panel to view the color coding for model differences.

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License. See the LICENSE file for more details.