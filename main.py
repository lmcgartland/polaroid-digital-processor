import cv2 as cv
import numpy as np
from datetime import datetime
import glob


def read_image(file):
    img = cv.imread(file)
    # resize image to make faster
    # img = cv.resize(img, (0, 0), fx=0.25, fy=0.25)

    gray = cv.cvtColor(img, cv.COLOR_BGR2GRAY)

    # darken all pixels that are 230 and above
    gray[gray <= 10] = 255
    # gray[gray <= 190] = 0

    # # increase the contrast of the image by 50%
    # clahe = cv.createCLAHE(clipLimit=1.0, tileGridSize=(100, 100))
    # gray = clahe.apply(gray)
    # gray = cv.GaussianBlur(gray, (5, 5), 0)

    # clahe = cv.createCLAHE(clipLimit=1.0, tileGridSize=(100, 100))
    # gray = clahe.apply(gray)
    # gray = cv.GaussianBlur(gray, (5, 5), 0)

    # clahe = cv.createCLAHE(clipLimit=1.0, tileGridSize=(100, 100))
    # gray = clahe.apply(gray)
    # gray = cv.GaussianBlur(gray, (5, 5), 0)

    # gray = cv.convertScaleAbs(gray, alpha=0.5, beta=0)

    # cv.imshow('grayscale', gray)
    # cv.waitKey(0)
    # exit()

    # ret, thresh = cv.threshold(gray, 226, 255, cv.THRESH_TOZERO)
    # ret, thresh = cv.threshold(gray, 100, 255, cv.THRESH_BINARY)

    # adaptive thresholding
    thresh = cv.adaptiveThreshold(
        gray, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 43, 2)

    # show threshold on image
    cv.imshow('threshold', thresh)
    # cv.waitKey(0)
    # exit()

    # def find_rectangles_using_adaptive_threshold:
    contours, hierarchy = cv.findContours(
        thresh, cv.RETR_CCOMP, cv.CHAIN_APPROX_SIMPLE)

    # print the number of contours found
    print('Number of contours found = ', len(contours))

    # draw the contours on the original image

    index = 0
    polaroids = []
    for cnt in contours:
        approx = cv.approxPolyDP(cnt, 0.01*cv.arcLength(cnt, True), True)

        if len(approx) == 4:
            area = cv.contourArea(cnt)

            # x, y, w, h = cv.boundingRect(approx)
    #         aspectRatio = float(w)/h
    #         print(aspectRatio)
            # if area > 1000:
            if area > 300000:  # and area < 3600000:
                cv.drawContours(img, [cnt], -1, (0, 255, 0), 3)

                print(area)
                rect = cv.minAreaRect(cnt)
                box = cv.boxPoints(rect)
                box = np.int0(box)
                # cv.drawContours(img, [box], 0, (0, 255, 0), 5)
                # get width and height of the detected rectangle
                width = int(rect[1][0])
                height = int(rect[1][1])

                src_pts = box.astype("float32")
                # coordinate of the points in box points after the rectangle has been
                # straightened
                padding = -10
                dst_pts = np.array([[padding, height-padding],
                                    [padding, padding],
                                    [width-padding, padding],
                                    [width-padding, height-padding]], dtype="float32")

                # the perspective transformation matrix
                M = cv.getPerspectiveTransform(src_pts, dst_pts)
                polaroid = cv.warpPerspective(img, M, (width, height))

                if(width > height):
                    polaroid = cv.rotate(polaroid, cv.ROTATE_90_CLOCKWISE)

                sharpen_filter = np.array(
                    [[0, -1, 0], [-1, 5, -1], [0, -1, 0]])
                polaroid = cv.filter2D(polaroid, -1, sharpen_filter)

                cv.imwrite('./out/polaroid_{}_{}.png'.format(
                    datetime.today().strftime('%Y-%m-%d-%H:%M:%S'), index), polaroid)

                polaroids.append(cnt)
                index += 1

    cv.imshow('shapes', img)

    cv.waitKey(0)
    cv.destroyAllWindows()


if __name__ == "__main__":
    # get all all image files in the folder './in' either in .jpg or .png or .tiff format
    files = glob.glob('./in/*.jpg') + glob.glob('./in/*.png') + \
        glob.glob('./in/*.tiff')

    # loop through all the files
    for file in files:
        read_image(file)
        break
