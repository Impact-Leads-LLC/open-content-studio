# face_detection_yunet_2023mar.onnx

YuNet face detector from the OpenCV Zoo (`models/face_detection_yunet/face_detection_yunet_2023mar.onnx`,
https://github.com/opencv/opencv_zoo), MIT License, by Shiqi Yu and contributors (232,589 bytes).

`faces.py` loads it with OpenCV's `cv2.FaceDetectorYN` (`pip install opencv-python-headless`). It only finds where each
person's face sits in their own camera, so cards, graphics and captions keep clear of it; nothing is generated.
